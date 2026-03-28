#!/bin/bash
# Tears down worktree-specific resources created by worktree-setup.sh.
#
# Usage:
#   bun run worktree:teardown
#
# Cleans up:
#   - Isolated DB container and volume (if --isolated-db was used)
#   - .env.worktree
#   - .worktree-id
#   - Temporary compose files
#   - Zero replica files

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Read worktree ID
if [ -f "$REPO_ROOT/.worktree-id" ]; then
  WT_ID=$(cat "$REPO_ROOT/.worktree-id")
else
  echo "No .worktree-id found — nothing to tear down."
  exit 0
fi

echo "Tearing down worktree ID=$WT_ID..."

# Stop and remove isolated DB container if it exists
DB_CONTAINER="pi-dash-postgres-wt${WT_ID}"
DB_COMPOSE="$REPO_ROOT/packages/db/docker-compose.wt${WT_ID}.yml"
DB_VOLUME="pi-dash_postgres_wt${WT_ID}_data"

if [ -f "$DB_COMPOSE" ]; then
  echo "Stopping isolated database..."
  docker compose -f "$DB_COMPOSE" stop 2>/dev/null || true
  docker compose -f "$DB_COMPOSE" rm -f 2>/dev/null || true
  docker volume rm "$DB_VOLUME" 2>/dev/null || true
  rm -f "$DB_COMPOSE"
  echo "✓ Removed isolated DB (container: $DB_CONTAINER)"
elif docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  docker stop "$DB_CONTAINER" 2>/dev/null || true
  docker rm "$DB_CONTAINER" 2>/dev/null || true
  docker volume rm "$DB_VOLUME" 2>/dev/null || true
  echo "✓ Removed isolated DB (container: $DB_CONTAINER)"
fi

# Remove E2E compose files
rm -f "$REPO_ROOT/packages/db/docker-compose.e2e-wt${WT_ID}.yml"

# Remove Zero replica files
rm -f "/tmp/pi-dash-wt${WT_ID}.db"*
rm -f "/tmp/pi-dash-test-wt${WT_ID}.db"*

# Remove log files
rm -f "/tmp/pi-dash-test-wt${WT_ID}-zero.log"
rm -f "/tmp/pi-dash-test-wt${WT_ID}-vite.log"

# Remove worktree config files
rm -f "$REPO_ROOT/.env.worktree"
rm -f "$REPO_ROOT/.worktree-id"

echo "✓ Worktree ID=$WT_ID teardown complete."
