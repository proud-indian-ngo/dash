#!/bin/bash
# Shared port computation utility for worktree isolation.
# Source this file from other scripts: source scripts/worktree-ports.sh
#
# Provides:
#   get_worktree_id  — returns the worktree ID (0 for main, 1-9 for worktrees)
#   compute_ports    — exports all port variables based on the worktree ID

set -euo pipefail

# Detect repo root if not already set
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

get_worktree_id() {
  # Priority 1: Explicit .worktree-id file
  if [ -f "$REPO_ROOT/.worktree-id" ]; then
    cat "$REPO_ROOT/.worktree-id"
    return
  fi

  # Priority 2: Auto-detect from git worktree path
  local wt_path main_path
  wt_path=$(git rev-parse --show-toplevel 2>/dev/null) || { echo 0; return; }
  main_path=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/worktree //')

  if [ -n "$main_path" ] && [ "$wt_path" != "$main_path" ]; then
    # Hash the worktree path to get a stable ID (1-9)
    local hash
    hash=$(echo "$wt_path" | cksum | cut -d' ' -f1)
    echo $(( (hash % 9) + 1 ))
    return
  fi

  # Priority 3: Main checkout
  echo 0
}

compute_ports() {
  local id="${1:-$(get_worktree_id)}"
  local offset=$((id * 10))

  # Dev server ports
  export DEV_WEB_PORT=$((3001 + offset))
  export ZERO_PORT=$((4848 + offset))

  # E2E test ports
  export E2E_WEB_PORT=$((3099 + offset))
  export E2E_ZERO_PORT=$((4870 + offset))
  export E2E_ZERO_CS_PORT=$((4871 + offset))
  export E2E_DB_PORT=$((5433 + offset))

  # Isolated dev DB port (only used with --isolated-db)
  if [ "$id" -gt 0 ]; then
    export ISOLATED_DB_PORT=$((5462 + (id - 1) * 10))
  else
    export ISOLATED_DB_PORT=0
  fi

  # Derived URLs
  export WT_BETTER_AUTH_URL="http://localhost:${DEV_WEB_PORT}"
  export WT_CORS_ORIGIN="http://localhost:${DEV_WEB_PORT}"
  export WT_ZERO_MUTATE_URL="http://localhost:${DEV_WEB_PORT}/api/zero/mutate"
  export WT_ZERO_QUERY_URL="http://localhost:${DEV_WEB_PORT}/api/zero/query"
  export WT_VITE_ZERO_URL="http://localhost:${ZERO_PORT}"
  export WT_ZERO_REPLICA_FILE="/tmp/pi-dash-wt${id}.db"
}

print_port_summary() {
  local id="${1:-$(get_worktree_id)}"
  compute_ports "$id"

  echo "╔════════════════════════════════════════╗"
  printf "║   Worktree Port Assignment (ID=%s)    ║\n" "$id"
  echo "╠════════════════════════════════════════╣"
  printf "║  %-20s :  %-5s       ║\n" "Vite dev server" "$DEV_WEB_PORT"
  printf "║  %-20s :  %-5s       ║\n" "Zero cache" "$ZERO_PORT"
  printf "║  %-20s :  %-5s       ║\n" "E2E web server" "$E2E_WEB_PORT"
  printf "║  %-20s :  %-5s       ║\n" "E2E Zero cache" "$E2E_ZERO_PORT"
  printf "║  %-20s :  %-5s       ║\n" "E2E Zero CS" "$E2E_ZERO_CS_PORT"
  printf "║  %-20s :  %-5s       ║\n" "E2E test DB" "$E2E_DB_PORT"
  echo "╚════════════════════════════════════════╝"
}
