#!/bin/bash
set -e

# Always run from repo root
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

RUN_STARTED=$SECONDS
DEFAULT_E2E_SERVER=production
# --perf runs the opt-in benchmarks under perf/ instead of the CI suite.
PLAYWRIGHT_CONFIG=packages/e2e/playwright.config.ts
if [ "${1:-}" = "--perf" ]; then
  PLAYWRIGHT_CONFIG=packages/e2e/perf/playwright.perf.config.ts
  shift
fi
for arg in "$@"; do
  case "$arg" in
    --list|--help|-h)
      exec bunx playwright test --config "$PLAYWRIGHT_CONFIG" "$@"
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

# Serialize runs that share this checkout (see process-cleanup.sh).
acquire_e2e_run_lock "$REPO_ROOT/packages/e2e/.run-e2e.lock"
trap release_e2e_run_lock EXIT

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
  export E2E_SIGNING_PORT=$((STACK_PORT + 4))
  export E2E_GOWA_PORT=$((STACK_PORT + 5))
  export E2E_R2_PORT=$((STACK_PORT + 6))
  # The run lock means anything on these ports is left over from an earlier
  # run in this checkout (one stopped before its teardown), so clear it first.
  STALE_SUFFIX=""
  [ "$WT_ID" -gt 0 ] && STALE_SUFFIX="-wt${WT_ID}"
  for STALE_CONTAINER in "pi-dash-postgres-test${STALE_SUFFIX}-stack${E2E_STACK_INDEX}" "pi-dash-signing-test${STALE_SUFFIX}-stack${E2E_STACK_INDEX}"; do
    if docker ps -aq --filter "name=^${STALE_CONTAINER}$" | grep -q .; then
      echo "Removing leftover E2E container $STALE_CONTAINER"
      docker rm -f "$STALE_CONTAINER" >/dev/null
    fi
  done
  for port in "$E2E_WEB_PORT" "$E2E_ZERO_PORT" "$E2E_ZERO_CS_PORT" "$E2E_GOWA_PORT" "$E2E_R2_PORT"; do
    stop_port_processes "$port" || true
  done
  for port in "$E2E_WEB_PORT" "$E2E_ZERO_PORT" "$E2E_ZERO_CS_PORT" "$E2E_DB_PORT" "$E2E_SIGNING_PORT" "$E2E_GOWA_PORT" "$E2E_R2_PORT"; do
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
TEST_SIGNING_PORT="$E2E_SIGNING_PORT"
TEST_GOWA_PORT="$E2E_GOWA_PORT"
TEST_R2_PORT="$E2E_R2_PORT"

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
GOWA_LOG="/tmp/pi-dash-test${WT_SUFFIX}-gowa.log"
R2_LOG="/tmp/pi-dash-test${WT_SUFFIX}-r2.log"
REPLICA_FILE="/tmp/pi-dash-test${WT_SUFFIX}.db"

ENCODED_DEV_DB_PASSWORD=$(bun -e 'process.stdout.write(encodeURIComponent(process.env.DEV_DB_PASSWORD ?? ""))')
export TEST_DB_URL="postgres://postgres:${ENCODED_DEV_DB_PASSWORD}@localhost:${TEST_DB_HOST_PORT}/pi-dash-test"
export VITE_E2E=true

# This run's throwaway CA and signers (signing/make-test-pki.py): the E2E
# signing service trusts only that CA, and specs play the DSC helper with
# the signers' keys.
export E2E_SIGNING_PKI_DIR="/tmp/pi-dash-test${WT_SUFFIX}-signing-pki"

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
  signing-test:
    build: ${REPO_ROOT}/services/signing
    image: pi-dash-signing-e2e${WT_SUFFIX}
    container_name: pi-dash-signing-test${WT_SUFFIX}
    environment:
      SIGNING_SERVICE_TOKEN: e2e-signing-token
      SIGNING_TRUST_ROOTS_DIR: /test-roots
      # No timestamp authority: the run stays offline.
      SIGNING_TSA_URL: none
    volumes:
      - ${E2E_SIGNING_PKI_DIR}/roots:/test-roots:ro
    ports:
      - "${TEST_SIGNING_PORT}:8080"
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
  if [ -n "${GOWA_PID:-}" ]; then
    kill "$GOWA_PID" 2>/dev/null || true
    wait "$GOWA_PID" 2>/dev/null || true
  fi
  if [ -n "${R2_PID:-}" ]; then
    kill "$R2_PID" 2>/dev/null || true
    wait "$R2_PID" 2>/dev/null || true
  fi
  stop_port_processes "$TEST_WEB_PORT" || cleanup_failed=1
  stop_port_processes "$TEST_ZERO_PORT" || cleanup_failed=1
  stop_port_processes "$TEST_ZERO_CS_PORT" || cleanup_failed=1
  stop_port_processes "$TEST_GOWA_PORT" || cleanup_failed=1
  stop_port_processes "$TEST_R2_PORT" || cleanup_failed=1
  if ! docker compose -f "$E2E_COMPOSE_FILE" down -v --remove-orphans; then
    echo "ERROR: failed to remove E2E containers and volumes"
    cleanup_failed=1
  fi
  rm -f "$E2E_COMPOSE_FILE"
  rm -rf "$E2E_SIGNING_PKI_DIR"
  release_e2e_run_lock
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
# Issuing circulars, minutes, declarations and utilisation certificates
# needs the signing service.
echo "Starting the signing service on port $TEST_SIGNING_PORT..."
docker compose -f "$E2E_COMPOSE_FILE" build signing-test
bash "$REPO_ROOT/packages/e2e/signing/make-test-pki.sh" \
  "pi-dash-signing-e2e${WT_SUFFIX}" "$E2E_SIGNING_PKI_DIR"
docker compose -f "$E2E_COMPOSE_FILE" up -d signing-test

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

WAIT=0
until curl -sf --max-time 2 "http://localhost:$TEST_SIGNING_PORT/health" >/dev/null 2>&1; do
  sleep 1
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 30 ]; then
    echo "ERROR: The signing service failed to start within 30s"
    docker logs "pi-dash-signing-test${WT_SUFFIX}"
    exit 1
  fi
done

# R2 goes to the fake (fake-r2.ts), started before seeding because the seed
# stores the receipt signature there. Keep in step with the e2e job env in
# .github/workflows/ci.yml.
echo "Starting the fake R2 on port $TEST_R2_PORT..."
stop_port_processes "$TEST_R2_PORT"
E2E_R2_PORT="$TEST_R2_PORT" bun packages/e2e/fake-r2.ts > "$R2_LOG" 2>&1 &
R2_PID=$!
export R2_ENDPOINT="http://localhost:$TEST_R2_PORT"
export R2_ACCOUNT_ID=e2e-account
export R2_ACCESS_KEY=e2e-access-key
export R2_SECRET_ACCESS_KEY=e2e-secret-access-key
export R2_BUCKET_NAME=e2e-bucket
export R2_KEY_PREFIX=attachments
until curl -sf --max-time 2 "$R2_ENDPOINT/health" >/dev/null 2>&1; do
  if ! kill -0 "$R2_PID" 2>/dev/null; then
    echo "ERROR: The fake R2 exited; see $R2_LOG"
    cat "$R2_LOG"
    exit 1
  fi
  sleep 1
done

# Migrate schema (run from packages/db so relative config path resolves)
echo "Migrating test database..."
(cd packages/db && DATABASE_URL="$TEST_DB_URL" SKIP_VALIDATION=true bun run scripts/migrate.ts)
(cd packages/zero && ZERO_UPSTREAM_DB="$TEST_DB_URL" bun run scripts/prepare-publication.ts)

# Seed test users (run from e2e package for workspace dep resolution)
echo "Seeding test users..."
(cd "$REPO_ROOT/packages/e2e" && DATABASE_URL="$TEST_DB_URL" SKIP_VALIDATION=true bun run helpers/seed-test-user.ts)

# Export env overrides for the test web server and zero-cache
export DATABASE_URL="$TEST_DB_URL"
export ZERO_UPSTREAM_DB="$TEST_DB_URL"
export ZERO_APP_PUBLICATIONS=pi_dash_public
export ZERO_CVR_DB="$TEST_DB_URL"
export ZERO_CHANGE_DB="$TEST_DB_URL"
export ZERO_REPLICA_FILE="$REPLICA_FILE"
export VITE_ZERO_URL="http://localhost:$TEST_ZERO_PORT"
export ZERO_MUTATE_URL="http://localhost:$TEST_WEB_PORT/api/zero/mutate"
export ZERO_QUERY_URL="http://localhost:$TEST_WEB_PORT/api/zero/query"
export ZERO_MUTATE_FORWARD_COOKIES=true
export ZERO_QUERY_FORWARD_COOKIES=true
export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-e2e-test-admin}"
export BETTER_AUTH_URL="http://localhost:$TEST_WEB_PORT"
export CORS_ORIGIN="http://localhost:$TEST_WEB_PORT"
export SKIP_VALIDATION=true
export ZERO_APP_ID=zero
# The HTTP health endpoint waits for workers and initial replication.
export ZERO_LAZY_STARTUP=false
# One zero-cache, so there's no earlier change-streamer to hand over from;
# the default waits 15s for a load balancer that isn't there.
export ZERO_CHANGE_STREAMER_STARTUP_DELAY_MS=0

export SIGNING_SERVICE_URL="http://localhost:$TEST_SIGNING_PORT"
export SIGNING_SERVICE_TOKEN=e2e-signing-token

# Social API photo links need a signing secret; a fixed test value is fine.
export SOCIAL_MEDIA_SIGNING_SECRET="${SOCIAL_MEDIA_SIGNING_SECRET:-e2e-social-media-signing-secret-0000}"

# Razorpay in test mode with a fixed webhook secret, and no key secret, so the
# job uses the signed webhook copy and never calls Razorpay. Keep in step with
# the e2e job env in .github/workflows/ci.yml.
export RAZORPAY_KEY_ID="rzp_test_e2e0000000000"
export RAZORPAY_WEBHOOK_SECRET="${E2E_RAZORPAY_WEBHOOK_SECRET:-e2e-razorpay-webhook-secret}"
export RAZORPAY_KEY_SECRET=""

# WhatsApp goes to the fake GoWA gateway (fake-gowa.ts), so it is configured
# but sends nothing. Keep in step with the e2e job env in
# .github/workflows/ci.yml.
export WHATSAPP_API_URL="http://localhost:$TEST_GOWA_PORT"
export WHATSAPP_AUTH_USER=""
export WHATSAPP_AUTH_PASS=""
export WHATSAPP_CLOUD_ACCESS_TOKEN=""
export WHATSAPP_CLOUD_PHONE_NUMBER_ID=""
# Never send real email; with no key the mailer skips sends.
export RESEND_API_KEY=""
export EMAIL_FROM=""

# Build against the isolated test URLs while Zero starts. Never serve an old
# build after source or build-time environment changes.
if [ "$E2E_SERVER" = production ]; then
  echo "Building production test server..."
  (cd apps/web && NODE_ENV=production exec bun run build) > "$BUILD_LOG" 2>&1 &
  BUILD_PID=$!
fi

echo "Starting the fake GoWA gateway on port $TEST_GOWA_PORT..."
stop_port_processes "$TEST_GOWA_PORT"
E2E_GOWA_PORT="$TEST_GOWA_PORT" bun packages/e2e/fake-gowa.ts > "$GOWA_LOG" 2>&1 &
GOWA_PID=$!

# Clean stale replica
rm -f "${REPLICA_FILE}"*

# Kill any lingering processes on our ports
stop_port_processes "$TEST_ZERO_PORT"
stop_port_processes "$TEST_ZERO_CS_PORT"

# Start zero-cache against test DB on a separate port
echo "Starting zero-cache on port $TEST_ZERO_PORT (change-streamer on $TEST_ZERO_CS_PORT)..."
export ZERO_CHANGE_STREAMER_PORT="$TEST_ZERO_CS_PORT"
# Match CI's authenticated inspector instead of the development auth bypass.
(cd packages/zero && NODE_ENV=production ZERO_PORT="$TEST_ZERO_PORT" bunx zero-cache) > "$ZERO_LOG" 2>&1 &
ZERO_PID=$!

# Wait for zero-cache to finish initial replication and start its workers.
# A fresh replica copies every table and builds its indexes first, which
# takes well over 30s on a loaded machine; a crash still fails at once.
ZERO_STARTED=$SECONDS
until curl -sf --max-time 2 "http://localhost:$TEST_ZERO_PORT" >/dev/null 2>&1; do
  if ! kill -0 "$ZERO_PID" 2>/dev/null; then
    echo "ERROR: zero-cache exited unexpectedly; see $ZERO_LOG"
    exit 1
  fi
  sleep 1
  if [ "$((SECONDS - ZERO_STARTED))" -ge 90 ]; then
    echo "ERROR: zero-cache failed to start within 90s"
    exit 1
  fi
done
echo "zero-cache ready."

until curl -sf --max-time 2 "http://localhost:$TEST_GOWA_PORT/health" >/dev/null 2>&1; do
  if ! kill -0 "$GOWA_PID" 2>/dev/null; then
    echo "ERROR: The fake GoWA gateway exited; see $GOWA_LOG"
    cat "$GOWA_LOG"
    exit 1
  fi
  sleep 1
done

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
# The exclusive_last project (setup's teardown) doesn't pull in setup, so a
# run naming only its specs would reuse stale auth state. Whenever spec files
# are named, global-setup.ts is named too (a no-op for other specs, whose
# projects depend on setup anyway).
PW_ARGS=("$@")
for arg in "$@"; do
  case "$arg" in
    *.spec.ts | tests/*)
      PW_ARGS+=("global-setup.ts")
      break
      ;;
  esac
done
set +e
TEST_STARTED=$SECONDS
bunx playwright test --config "$PLAYWRIGHT_CONFIG" "${PW_ARGS[@]}"
EXIT_CODE=$?
echo "Playwright finished in $((SECONDS - TEST_STARTED))s."
exit $EXIT_CODE
