#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.prod.yml"
BACKUP_DIR_DEFAULT="$REPO_ROOT/backups/pg-prod-cutover"
ENV_FILE_DEFAULT="$REPO_ROOT/.env"
OLD_SERVICE="postgres"
NEW_SERVICE="postgres18"
OLD_PORT="5432"
NEW_PORT="5433"
DB_NAME_DEFAULT="pi-dash"
DB_USER_DEFAULT="postgres"
ENV_FILE="$ENV_FILE_DEFAULT"

parse_args() {
  COMMAND=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --docker-host)
        export DOCKER_HOST="$2"
        shift 2
        ;;
      --env-file)
        ENV_FILE="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      bootstrap-pg18|final-sync|verify|cleanup-pg17)
        COMMAND="$1"
        shift
        ;;
      *)
        echo "Unknown argument: $1"
        usage
        exit 1
        ;;
    esac
  done

  if [ -z "$COMMAND" ]; then
    usage
    exit 1
  fi
}

usage() {
  cat <<'EOF'
Usage: bash scripts/pg-prod-cutover.sh [--docker-host ssh://user@host] [--env-file path] <command>

Commands:
  bootstrap-pg18   Start postgres/postgres18, copy prod data from PG17 -> PG18, compare row counts
  final-sync       Stop web + zero-cache, re-copy postgres -> postgres18, compare row counts
  verify           Show versions, wal_level, row counts, and active DB port
  cleanup-pg17     Stop/remove postgres container and delete its volume after rollback window ends

Options:
  --docker-host    Remote Docker daemon to target (example: ssh://root@server)
  --env-file       Local env file to source for POSTGRES_PASSWORD/POSTGRES_DB/POSTGRES_USER/DB_PORT

Expected flow:
  1. Deploy updated docker-compose.prod.yml with both postgres and postgres18 present.
  2. Run: bash scripts/pg-prod-cutover.sh bootstrap-pg18
  3. Inspect/verify postgres18 contents.
  4. Maintenance window: bash scripts/pg-prod-cutover.sh final-sync
  5. In Dokploy set DB_PORT=5433 and redeploy so migrate/web/zero-cache use postgres18.
  6. Run: bash scripts/pg-prod-cutover.sh verify
  7. After rollback window ends, remove postgres from compose and run cleanup-pg17.
EOF
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck source=/dev/null
    . "$ENV_FILE"
    set +a
  fi

  DB_NAME="${POSTGRES_DB:-$DB_NAME_DEFAULT}"
  DB_USER="${POSTGRES_USER:-$DB_USER_DEFAULT}"
  DB_PORT_VALUE="${DB_PORT:-$OLD_PORT}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in the shell or .env}"
}

print_target() {
  echo "Docker target: ${DOCKER_HOST:-local daemon}"
  echo "Env file: ${ENV_FILE}"
}

wait_for_service() {
  local service="$1"
  local port="$2"
  local wait=0

  until compose exec -T "$service" pg_isready -p "$port" -U "$DB_USER" >/dev/null 2>&1; do
    sleep 1
    wait=$((wait + 1))
    if [ "$wait" -ge 90 ]; then
      echo "ERROR: $service did not become ready on port $port within 90s"
      exit 1
    fi
  done
}

psql_service() {
  local service="$1"
  local port="$2"
  local database="$3"
  local sql="$4"
  PGPASSWORD="$POSTGRES_PASSWORD" compose exec -T "$service" \
    psql -p "$port" -U "$DB_USER" -d "$database" -Atqc "$sql"
}

backup_path() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "${BACKUP_DIR:-$BACKUP_DIR_DEFAULT}"
  echo "${BACKUP_DIR:-$BACKUP_DIR_DEFAULT}/${DB_NAME}-${stamp}.dump"
}

compare_row_counts() {
  echo "Comparing row counts between postgres and postgres18..."

  local tables
  tables="$(psql_service "$OLD_SERVICE" "$OLD_PORT" "$DB_NAME" "select tablename from pg_tables where schemaname = 'public' order by 1")"

  if [ -z "$tables" ]; then
    echo "No public tables found in $DB_NAME; nothing to compare."
    return
  fi

  while IFS= read -r table; do
    [ -z "$table" ] && continue

    local old_count new_count
    old_count="$(psql_service "$OLD_SERVICE" "$OLD_PORT" "$DB_NAME" "select count(*) from \"$table\"")"
    new_count="$(psql_service "$NEW_SERVICE" "$NEW_PORT" "$DB_NAME" "select count(*) from \"$table\"")"

    if [ "$old_count" != "$new_count" ]; then
      echo "ERROR: row-count mismatch for $table (postgres=$old_count postgres18=$new_count)"
      exit 1
    fi

    echo "  ✓ $table ($old_count rows)"
  done <<< "$tables"
}

copy_pg17_to_pg18() {
  local dump_path
  dump_path="$(backup_path)"

  echo "Starting postgres/postgres18..."
  compose up -d tailscale-postgres "$OLD_SERVICE" "$NEW_SERVICE"
  wait_for_service "$OLD_SERVICE" "$OLD_PORT"
  wait_for_service "$NEW_SERVICE" "$NEW_PORT"

  echo "Creating postgres (PG17) backup at $dump_path ..."
  PGPASSWORD="$POSTGRES_PASSWORD" compose exec -T "$OLD_SERVICE" \
    pg_dump -p "$OLD_PORT" -U "$DB_USER" -Fc -d "$DB_NAME" > "$dump_path"

  echo "Restoring backup into postgres18..."
  cat "$dump_path" | PGPASSWORD="$POSTGRES_PASSWORD" compose exec -T "$NEW_SERVICE" \
    pg_restore -p "$NEW_PORT" -U "$DB_USER" -d postgres --clean --if-exists --create

  echo "Rebuilding planner statistics on postgres18..."
  PGPASSWORD="$POSTGRES_PASSWORD" compose exec -T "$NEW_SERVICE" \
    vacuumdb -p "$NEW_PORT" -U "$DB_USER" -d "$DB_NAME" --analyze-in-stages

  compare_row_counts
  echo "Done. Backup saved at: $dump_path"
}

bootstrap_pg18() {
  copy_pg17_to_pg18
  echo
  echo "Bootstrap complete. App is still expected to use DB_PORT=$OLD_PORT until you change Dokploy env."
}

final_sync() {
  echo "Stopping web and zero-cache for final consistent sync..."
  compose stop web zero-cache || true
  copy_pg17_to_pg18
  echo
  echo "Final sync complete. Next step: set DB_PORT=$NEW_PORT in Dokploy and redeploy migrate/web/zero-cache."
}

verify() {
  load_env
  compose up -d tailscale-postgres "$OLD_SERVICE" "$NEW_SERVICE"
  wait_for_service "$OLD_SERVICE" "$OLD_PORT"
  wait_for_service "$NEW_SERVICE" "$NEW_PORT"

  echo "Current DB_PORT target: ${DB_PORT_VALUE}"
  echo
  echo "postgres17 ($OLD_PORT)"
  echo "  version:   $(psql_service "$OLD_SERVICE" "$OLD_PORT" "$DB_NAME" "select version()")"
  echo "  wal_level: $(psql_service "$OLD_SERVICE" "$OLD_PORT" "$DB_NAME" "show wal_level")"
  echo
  echo "postgres18 ($NEW_PORT)"
  echo "  version:   $(psql_service "$NEW_SERVICE" "$NEW_PORT" "$DB_NAME" "select version()")"
  echo "  wal_level: $(psql_service "$NEW_SERVICE" "$NEW_PORT" "$DB_NAME" "show wal_level")"
  echo

  compare_row_counts

  if [ "$DB_PORT_VALUE" = "$NEW_PORT" ]; then
    echo "Active compose routing points to postgres18."
  else
    echo "Active compose routing points to postgres17."
  fi
}

cleanup_pg17() {
  echo "Stopping/removing postgres..."
  compose stop "$OLD_SERVICE" || true
  compose rm -f "$OLD_SERVICE" || true

  local volume_name
  volume_name="$(compose config --volumes | grep '^postgres_data$' || true)"
  if [ -n "$volume_name" ]; then
    docker volume rm "$(docker volume ls --format '{{.Name}}' | grep '_postgres_data$' | head -1)" 2>/dev/null || true
  fi

  echo "postgres cleanup finished. Remove postgres from docker-compose.prod.yml once rollback window is over."
}

main() {
  parse_args "$@"
  load_env
  print_target

  case "$COMMAND" in
    bootstrap-pg18)
      bootstrap_pg18
      ;;
    final-sync)
      final_sync
      ;;
    verify)
      verify
      ;;
    cleanup-pg17)
      cleanup_pg17
      ;;
  esac
}

main "$@"
