#!/bin/bash
set -e

# Always run from repo root
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Load root .env (needed for auth secrets, DB password, etc.)
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . ./.env
  set +a
fi

# Override with test-specific values from e2e/.env.test
if [ -f packages/e2e/.env.test ]; then
  set -a
  # shellcheck source=/dev/null
  . ./packages/e2e/.env.test
  set +a
fi

export TEST_DB_URL="postgres://postgres:${DEV_PG_PASSWORD}@localhost:5433/pi-dash-test"
TEST_ZERO_PORT=4870
TEST_ZERO_CS_PORT=4871
TEST_WEB_PORT=3099

cleanup() {
  echo "Tearing down test environment..."
  # Kill zero-cache if running
  if [ -n "$ZERO_PID" ]; then
    kill "$ZERO_PID" 2>/dev/null || true
    wait "$ZERO_PID" 2>/dev/null || true
  fi
  docker compose -f packages/db/docker-compose.yml stop postgres-test
  docker compose -f packages/db/docker-compose.yml rm -f postgres-test
  docker volume rm pi-dash_pi-dash_postgres_test_data 2>/dev/null || true
}

# Start test DB
echo "Starting test database on port 5433..."
docker compose -f packages/db/docker-compose.yml up -d postgres-test

# Ensure teardown on exit (set immediately after DB starts so early failures still clean up)
trap cleanup EXIT

# Wait for healthy (timeout after 30s)
echo "Waiting for test database to be ready..."
WAIT=0
until docker exec pi-dash-postgres-test pg_isready -U postgres 2>/dev/null; do
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
export ZERO_REPLICA_FILE="/tmp/pi-dash-test.db"
export VITE_PUBLIC_ZERO_CACHE_URL="http://localhost:$TEST_ZERO_PORT"
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
rm -f /tmp/pi-dash-test.db*

# Kill any lingering test zero-cache from a previous run
pkill -f "zero-cache-dev.*ZERO_PORT=$TEST_ZERO_PORT" 2>/dev/null || true
# Also ensure nothing is on our ports
lsof -ti :"$TEST_ZERO_PORT" | xargs kill 2>/dev/null || true
lsof -ti :"$TEST_ZERO_CS_PORT" | xargs kill 2>/dev/null || true
sleep 1

# Start zero-cache against test DB on a separate port
echo "Starting zero-cache on port $TEST_ZERO_PORT (change-streamer on $TEST_ZERO_CS_PORT)..."
export ZERO_CHANGE_STREAMER_PORT="$TEST_ZERO_CS_PORT"
(cd packages/zero && ZERO_PORT="$TEST_ZERO_PORT" bunx zero-cache-dev) > /tmp/pi-dash-test-zero.log 2>&1 &
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
# Wait for initial replication to complete (replica file in wal2 mode)
echo "Waiting for initial replication to complete..."
WAIT=0
while true; do
  if [ -f /tmp/pi-dash-test.db ]; then
    MODE=$(sqlite3 /tmp/pi-dash-test.db "PRAGMA journal_mode;" 2>/dev/null || echo "")
    if [ "$MODE" = "wal2" ] || [ "$MODE" = "wal" ]; then
      break
    fi
  fi
  sleep 1
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 30 ]; then
    echo "WARNING: Replica not in wal2 mode after 30s, proceeding anyway"
    break
  fi
done
echo "zero-cache ready."

# Verify replica has data
if [ -f /tmp/pi-dash-test.db ]; then
  JOURNAL=$(sqlite3 /tmp/pi-dash-test.db "PRAGMA journal_mode;" 2>/dev/null || echo "unknown")
  TABLES=$(sqlite3 /tmp/pi-dash-test.db ".tables" 2>/dev/null | wc -w || echo "0")
  BANK_COUNT=$(sqlite3 /tmp/pi-dash-test.db "SELECT count(*) FROM bank_account;" 2>/dev/null || echo "N/A")
  echo "Replica: journal_mode=$JOURNAL, tables=$TABLES, bank_accounts=$BANK_COUNT"
fi

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
