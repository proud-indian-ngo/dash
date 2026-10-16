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
# worktree-setup.sh declares this volume in a compose file named
# "pi-dash-wt${WT_ID}", so Docker Compose stores it with that project prefix.
DB_VOLUME="pi-dash_postgres_wt${WT_ID}_data"
DB_VOLUMES=("pi-dash-wt${WT_ID}_${DB_VOLUME}" "$DB_VOLUME")

if [ -f "$DB_COMPOSE" ]; then
  echo "Stopping isolated database..."
  # down -v removes the project-prefixed volume compose created.
  docker compose -f "$DB_COMPOSE" down -v --remove-orphans 2>/dev/null || true
  rm -f "$DB_COMPOSE"
  echo "✓ Removed isolated DB (container: $DB_CONTAINER)"
elif docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  docker stop "$DB_CONTAINER" 2>/dev/null || true
  docker rm "$DB_CONTAINER" 2>/dev/null || true
  echo "✓ Removed isolated DB (container: $DB_CONTAINER)"
fi

# Remove any volume left behind under either name, e.g. when the compose file
# was deleted before teardown ran.
for volume in "${DB_VOLUMES[@]}"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume rm "$volume" >/dev/null 2>&1 && echo "✓ Removed volume $volume" || true
  fi
done

# Remove a leftover E2E stack (run-e2e.sh removes it on exit; this covers runs
# that were killed before their cleanup trap ran).
for e2e_compose in "$REPO_ROOT"/packages/db/docker-compose.e2e-wt"${WT_ID}".yml \
  "$REPO_ROOT"/packages/db/docker-compose.e2e-wt"${WT_ID}"-stack*.yml; do
  [ -f "$e2e_compose" ] || continue
  docker compose -f "$e2e_compose" down -v --remove-orphans 2>/dev/null || true
  rm -f "$e2e_compose"
done

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
