#!/bin/bash
set -e

# Always run from repo root
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Load shared port computation utility
# shellcheck source=../../scripts/worktree-ports.sh
source "$REPO_ROOT/scripts/worktree-ports.sh"

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

# Compute worktree-aware ports
WT_ID=$(get_worktree_id)
compute_ports "$WT_ID"

# Use computed ports (these come from compute_ports)
TEST_WEB_PORT="$E2E_WEB_PORT"
TEST_ZERO_PORT="$E2E_ZERO_PORT"
TEST_ZERO_CS_PORT="$E2E_ZERO_CS_PORT"
TEST_DB_HOST_PORT="$E2E_DB_PORT"

# Worktree-unique suffixes for containers, volumes, and temp files
WT_SUFFIX=""
[ "$WT_ID" -gt 0 ] && WT_SUFFIX="-wt${WT_ID}"

TEST_CONTAINER="pi-dash-postgres-test${WT_SUFFIX}"
TEST_VOLUME="pi-dash_postgres_test${WT_SUFFIX}_data"
COMPOSE_PROJECT="pi-dash-e2e${WT_SUFFIX}"
ZERO_LOG="/tmp/pi-dash-test${WT_SUFFIX}-zero.log"
VITE_LOG="/tmp/pi-dash-test${WT_SUFFIX}-vite.log"
REPLICA_FILE="/tmp/pi-dash-test${WT_SUFFIX}.db"

export TEST_DB_URL="postgres://postgres:${DEV_DB_PASSWORD}@localhost:${TEST_DB_HOST_PORT}/pi-dash-test"

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
    command: postgres -c wal_level=logical
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
  echo "Tearing down test environment..."
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
  docker compose -f "$E2E_COMPOSE_FILE" stop postgres-test 2>/dev/null || true
  docker compose -f "$E2E_COMPOSE_FILE" rm -f postgres-test 2>/dev/null || true
  docker volume rm "$TEST_VOLUME" 2>/dev/null || true
  rm -f "$E2E_COMPOSE_FILE"
}

# Start test DB
echo "Starting test database on port $TEST_DB_HOST_PORT (container: $TEST_CONTAINER)..."
docker compose -f "$E2E_COMPOSE_FILE" up -d postgres-test

# Ensure teardown on exit (set immediately after DB starts so early failures still clean up)
trap cleanup EXIT

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

# Push schema (run from packages/db so relative schema path resolves)
echo "Pushing schema to test database..."
(cd packages/db && DATABASE_URL="$TEST_DB_URL" SKIP_VALIDATION=true bunx drizzle-kit push)

# Seed test users (run from e2e package for workspace dep resolution)
echo "Seeding test users..."
(cd "$REPO_ROOT/packages/e2e" && DATABASE_URL="$TEST_DB_URL" SKIP_VALIDATION=true bun run helpers/seed-test-user.ts)

# Export env overrides for the test web server and zero-cache
export DATABASE_URL="$TEST_DB_URL"
export ZERO_UPSTREAM_DB="$TEST_DB_URL"
export ZERO_REPLICA_FILE="$REPLICA_FILE"
export VITE_ZERO_URL="http://localhost:$TEST_ZERO_PORT"
export ZERO_MUTATE_URL="http://localhost:$TEST_WEB_PORT/api/zero/mutate"
export ZERO_QUERY_URL="http://localhost:$TEST_WEB_PORT/api/zero/query"
export BETTER_AUTH_URL="http://localhost:$TEST_WEB_PORT"
export CORS_ORIGIN="http://localhost:$TEST_WEB_PORT"
export SKIP_VALIDATION=true
export VITE_E2E=true

# Disable external notification services during E2E tests
unset COURIER_API_KEY
unset WHATSAPP_API_URL
unset WHATSAPP_AUTH_USER
unset WHATSAPP_AUTH_PASS

# Clean stale replica
rm -f "${REPLICA_FILE}"*

# Kill any lingering processes on our ports
lsof -ti :"$TEST_ZERO_PORT" | xargs kill 2>/dev/null || true
lsof -ti :"$TEST_ZERO_CS_PORT" | xargs kill 2>/dev/null || true
sleep 1

# Start zero-cache against test DB on a separate port
echo "Starting zero-cache on port $TEST_ZERO_PORT (change-streamer on $TEST_ZERO_CS_PORT)..."
export ZERO_CHANGE_STREAMER_PORT="$TEST_ZERO_CS_PORT"
(cd packages/zero && ZERO_PORT="$TEST_ZERO_PORT" bunx zero-cache-dev) > "$ZERO_LOG" 2>&1 &
ZERO_PID=$!

# Wait for zero-cache to be ready
WAIT=0
until curl -sf "http://localhost:$TEST_ZERO_PORT" >/dev/null 2>&1; do
  sleep 1
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 30 ]; then
    echo "ERROR: zero-cache failed to start within 30s"
    exit 1
  fi
done
# Wait for initial replication by checking zero-cache logs for watermark
echo "Waiting for initial replication to complete..."
WAIT=0
while true; do
  if grep -q "replicated up to watermark" "$ZERO_LOG" 2>/dev/null; then
    echo "Replication complete."
    break
  fi
  sleep 1
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 60 ]; then
    echo "WARNING: Replication not confirmed after 60s, proceeding anyway"
    break
  fi
done
echo "zero-cache ready."

# Start vite dev server and pre-warm it (cold SSR compilation is slow)
echo "Starting vite dev server on port $TEST_WEB_PORT..."
lsof -ti :"$TEST_WEB_PORT" | xargs kill 2>/dev/null || true
sleep 1
(cd apps/web && bunx --bun vite dev --port "$TEST_WEB_PORT") > "$VITE_LOG" 2>&1 &
VITE_PID=$!

# Wait for vite to bind the port
WAIT=0
until curl -sf -o /dev/null "http://localhost:$TEST_WEB_PORT" 2>/dev/null; do
  # Check if vite is still running
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "ERROR: Vite dev server exited unexpectedly"
    cat "$VITE_LOG"
    exit 1
  fi
  sleep 2
  WAIT=$((WAIT + 2))
  if [ "$WAIT" -ge 180 ]; then
    echo "ERROR: Vite dev server failed to respond within 180s"
    cat "$VITE_LOG"
    exit 1
  fi
done
echo "Vite dev server ready (pre-warmed in ${WAIT}s)."

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
bunx playwright test --config packages/e2e/playwright.config.ts "$@"
EXIT_CODE=$?
exit $EXIT_CODE
