#!/bin/bash
set -e

# Always run from repo root
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

RUN_STARTED=$SECONDS
DEFAULT_E2E_SERVER=production
for arg in "$@"; do
  case "$arg" in
    --list|--help|-h)
      exec bunx playwright test --config packages/e2e/playwright.config.ts "$@"
      ;;
    --ui|--ui=*|--ui-host=*|--ui-port=*|--debug|--debug=*) DEFAULT_E2E_SERVER=dev ;;
  esac
done
# Load shared port computation utility
# shellcheck source=../../scripts/worktree-ports.sh
source "$REPO_ROOT/scripts/worktree-ports.sh"
# shellcheck source=process-cleanup.sh
source "$REPO_ROOT/packages/e2e/process-cleanup.sh"

# Load root .env (needed for auth secrets, DB password, etc.)
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

# Load worktree overrides if present
if [ -f .env.worktree ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env.worktree
  set +a
fi

# Override with test-specific values from e2e/.env.test
if [ -f packages/e2e/.env.test ]; then
  set -a
  # shellcheck source=/dev/null
  . ./packages/e2e/.env.test
  set +a
fi

E2E_SERVER="${E2E_SERVER:-$DEFAULT_E2E_SERVER}"
case "$E2E_SERVER" in
  production|dev) ;;
  *) echo "ERROR: E2E_SERVER must be production or dev"; exit 1 ;;
esac

# Compute worktree-aware ports
WT_ID=$(get_worktree_id)
compute_ports "$WT_ID"

# Reserved per-worktree ports for the opt-in two-stack runner.
if [ -n "${E2E_STACK_INDEX:-}" ]; then
  case "$E2E_STACK_INDEX" in
    1|2) ;;
    *) echo "ERROR: E2E_STACK_INDEX must be 1 or 2"; exit 1 ;;
  esac
  STACK_PORT=$((20000 + WT_ID * 100 + E2E_STACK_INDEX * 10))
  export E2E_WEB_PORT="$STACK_PORT"
  export E2E_ZERO_PORT=$((STACK_PORT + 1))
  export E2E_ZERO_CS_PORT=$((STACK_PORT + 2))
  export E2E_DB_PORT=$((STACK_PORT + 3))
  for port in "$E2E_WEB_PORT" "$E2E_ZERO_PORT" "$E2E_ZERO_CS_PORT" "$E2E_DB_PORT"; do
    if [ -n "$(port_listener_pids "$port")" ]; then
      echo "ERROR: stack port $port is already in use"
      exit 1
    fi
  done
fi

# Use computed ports (these come from compute_ports)
TEST_WEB_PORT="$E2E_WEB_PORT"
TEST_ZERO_PORT="$E2E_ZERO_PORT"
TEST_ZERO_CS_PORT="$E2E_ZERO_CS_PORT"
TEST_DB_HOST_PORT="$E2E_DB_PORT"

# Worktree-unique suffixes for containers, volumes, and temp files
WT_SUFFIX=""
[ "$WT_ID" -gt 0 ] && WT_SUFFIX="-wt${WT_ID}"
[ -n "${E2E_STACK_INDEX:-}" ] && WT_SUFFIX="${WT_SUFFIX}-stack${E2E_STACK_INDEX}"

TEST_CONTAINER="pi-dash-postgres-test${WT_SUFFIX}"
TEST_VOLUME="pi-dash_postgres_test${WT_SUFFIX}_data"
COMPOSE_PROJECT="pi-dash-e2e${WT_SUFFIX}"
ZERO_LOG="/tmp/pi-dash-test${WT_SUFFIX}-zero.log"
VITE_LOG="/tmp/pi-dash-test${WT_SUFFIX}-vite.log"
BUILD_LOG="/tmp/pi-dash-test${WT_SUFFIX}-build.log"
REPLICA_FILE="/tmp/pi-dash-test${WT_SUFFIX}.db"

ENCODED_DEV_DB_PASSWORD=$(bun -e 'process.stdout.write(encodeURIComponent(process.env.DEV_DB_PASSWORD ?? ""))')
export TEST_DB_URL="postgres://postgres:${ENCODED_DEV_DB_PASSWORD}@localhost:${TEST_DB_HOST_PORT}/pi-dash-test"
export VITE_E2E=true

# Generate a temporary docker-compose file for this E2E run
E2E_COMPOSE_FILE="$REPO_ROOT/packages/db/docker-compose.e2e${WT_SUFFIX}.yml"
cat > "$E2E_COMPOSE_FILE" <<YAML
name: ${COMPOSE_PROJECT}
services:
  postgres-test:
    image: postgres:18
    container_name: ${TEST_CONTAINER}
    environment:
      POSTGRES_DB: pi-dash-test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DEV_DB_PASSWORD}
    command: postgres -c wal_level=logical -c max_connections=300
    ports:
      - "${TEST_DB_HOST_PORT}:5432"
    volumes:
      - ${TEST_VOLUME}:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
volumes:
  ${TEST_VOLUME}:
YAML

cleanup() {
  local cleanup_failed=0

  echo "Tearing down test environment..."
  if [ -n "${BUILD_PID:-}" ]; then
    kill "$BUILD_PID" 2>/dev/null || true
    wait "$BUILD_PID" 2>/dev/null || true
  fi
  # Kill vite dev server if running
  if [ -n "${VITE_PID:-}" ]; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
  # Kill zero-cache if running
  if [ -n "${ZERO_PID:-}" ]; then
    kill "$ZERO_PID" 2>/dev/null || true
    wait "$ZERO_PID" 2>/dev/null || true
  fi
  stop_port_processes "$TEST_WEB_PORT" || cleanup_failed=1
  stop_port_processes "$TEST_ZERO_PORT" || cleanup_failed=1
  stop_port_processes "$TEST_ZERO_CS_PORT" || cleanup_failed=1
  if ! docker compose -f "$E2E_COMPOSE_FILE" down -v --remove-orphans; then
    echo "ERROR: failed to remove E2E containers and volumes"
    cleanup_failed=1
  fi
  rm -f "$E2E_COMPOSE_FILE"
  echo "E2E total: $((SECONDS - RUN_STARTED))s (including teardown)"

  return "$cleanup_failed"
}

# Install teardown before the initial reset so early failures remove generated state.
trap cleanup_on_exit EXIT

# Ensure a clean slate: remove any leftover container and volume from a previous run
echo "Cleaning up any previous test environment..."
docker compose -f "$E2E_COMPOSE_FILE" down -v --remove-orphans

# Start test DB
echo "Starting test database on port $TEST_DB_HOST_PORT (container: $TEST_CONTAINER)..."
docker compose -f "$E2E_COMPOSE_FILE" up -d postgres-test

# Wait for healthy (timeout after 30s)
echo "Waiting for test database to be ready..."
WAIT=0
until docker exec "$TEST_CONTAINER" pg_isready -U postgres 2>/dev/null; do
  sleep 1
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 30 ]; then
    echo "ERROR: Test database failed to become ready within 30s"
    exit 1
  fi
done

# Migrate schema (run from packages/db so relative config path resolves)
echo "Migrating test database..."
(cd packages/db && DATABASE_URL="$TEST_DB_URL" SKIP_VALIDATION=true bun run scripts/migrate.ts)

# Seed test users (run from e2e package for workspace dep resolution)
echo "Seeding test users..."
(cd "$REPO_ROOT/packages/e2e" && DATABASE_URL="$TEST_DB_URL" SKIP_VALIDATION=true bun run helpers/seed-test-user.ts)

# Export env overrides for the test web server and zero-cache
export DATABASE_URL="$TEST_DB_URL"
export ZERO_UPSTREAM_DB="$TEST_DB_URL"
export ZERO_CVR_DB="$TEST_DB_URL"
export ZERO_CHANGE_DB="$TEST_DB_URL"
export ZERO_REPLICA_FILE="$REPLICA_FILE"
export VITE_ZERO_URL="http://localhost:$TEST_ZERO_PORT"
export ZERO_MUTATE_URL="http://localhost:$TEST_WEB_PORT/api/zero/mutate"
export ZERO_QUERY_URL="http://localhost:$TEST_WEB_PORT/api/zero/query"
export ZERO_MUTATE_FORWARD_COOKIES=true
export ZERO_QUERY_FORWARD_COOKIES=true
export BETTER_AUTH_URL="http://localhost:$TEST_WEB_PORT"
export CORS_ORIGIN="http://localhost:$TEST_WEB_PORT"
export SKIP_VALIDATION=true
export ZERO_APP_ID=zero
# The HTTP health endpoint waits for workers and initial replication.
export ZERO_LAZY_STARTUP=false

# Keep dotenv in child processes from restoring the development service URL.
export WHATSAPP_API_URL=""
export WHATSAPP_AUTH_USER=""
export WHATSAPP_AUTH_PASS=""

# Build against the isolated test URLs while Zero starts. Never serve an old
# build after source or build-time environment changes.
if [ "$E2E_SERVER" = production ]; then
  echo "Building production test server..."
  (cd apps/web && NODE_ENV=production exec bun run build) > "$BUILD_LOG" 2>&1 &
  BUILD_PID=$!
fi

# Clean stale replica
rm -f "${REPLICA_FILE}"*

# Kill any lingering processes on our ports
stop_port_processes "$TEST_ZERO_PORT"
stop_port_processes "$TEST_ZERO_CS_PORT"

# Start zero-cache against test DB on a separate port
echo "Starting zero-cache on port $TEST_ZERO_PORT (change-streamer on $TEST_ZERO_CS_PORT)..."
export ZERO_CHANGE_STREAMER_PORT="$TEST_ZERO_CS_PORT"
(cd packages/zero && ZERO_PORT="$TEST_ZERO_PORT" bunx zero-cache-dev) > "$ZERO_LOG" 2>&1 &
ZERO_PID=$!

# Wait for zero-cache to finish initial replication and start its workers.
ZERO_STARTED=$SECONDS
until curl -sf --max-time 2 "http://localhost:$TEST_ZERO_PORT" >/dev/null 2>&1; do
  if ! kill -0 "$ZERO_PID" 2>/dev/null; then
    echo "ERROR: zero-cache exited unexpectedly; see $ZERO_LOG"
    exit 1
  fi
  sleep 1
  if [ "$((SECONDS - ZERO_STARTED))" -ge 30 ]; then
    echo "ERROR: zero-cache failed to start within 30s"
    exit 1
  fi
done
echo "zero-cache ready."

echo "Starting $E2E_SERVER test server on port $TEST_WEB_PORT..."
stop_port_processes "$TEST_WEB_PORT"
if [ "$E2E_SERVER" = production ]; then
  if ! wait "$BUILD_PID"; then
    cat "$BUILD_LOG"
    exit 1
  fi
  BUILD_PID=""
  # Use the optimized bundle with the local test environment. Deployment-only
  # HTTPS/CSP policies don't permit the separate localhost Zero port.
  (cd apps/web && NODE_ENV=test PORT="$TEST_WEB_PORT" exec bun run .output/server/index.mjs) > "$VITE_LOG" 2>&1 &
else
  (cd apps/web && exec bunx --bun vite dev --port "$TEST_WEB_PORT") > "$VITE_LOG" 2>&1 &
fi
VITE_PID=$!

# Bound wall-clock readiness, including the first SSR request.
SERVER_STARTED=$SECONDS
until curl -sf --max-time 5 -o /dev/null "http://localhost:$TEST_WEB_PORT" 2>/dev/null; do
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "ERROR: Test web server exited unexpectedly"
    cat "$VITE_LOG"
    exit 1
  fi
  sleep 1
  if [ "$((SECONDS - SERVER_STARTED))" -ge 180 ]; then
    echo "ERROR: Test web server failed to respond within 180s"
    cat "$VITE_LOG"
    exit 1
  fi
done
echo "E2E environment ready in $((SECONDS - RUN_STARTED))s."

# Tell Playwright to reuse our pre-warmed server
export BASE_URL="http://localhost:$TEST_WEB_PORT"

# Run Playwright
# Accept optional test file paths relative to packages/e2e/ (e.g., tests/foo.spec.ts)
# If no args given, runs all tests.
if [ $# -gt 0 ]; then
  echo "Running Playwright tests: $*"
else
  echo "Running all Playwright tests..."
fi
set +e
TEST_STARTED=$SECONDS
bunx playwright test --config packages/e2e/playwright.config.ts "$@"
EXIT_CODE=$?
echo "Playwright finished in $((SECONDS - TEST_STARTED))s."
exit $EXIT_CODE
