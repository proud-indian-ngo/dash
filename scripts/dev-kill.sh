#!/bin/bash
# Kill all development processes spawned by 'bun dev' and clean up stale locks.
# Usage: bun run dev:kill
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/scripts/worktree-ports.sh"

KILLED=0

kill_pid() {
  local pid=$1 reason=$2
  local cmd
  cmd=$(ps -p "$pid" -o command= 2>/dev/null) || return 0
  echo "  kill $pid — $reason — $cmd"
  kill -9 "$pid" 2>/dev/null || true
  KILLED=$((KILLED + 1))
}

# Returns 0 (true) if the process's command line references REPO_ROOT.
# Uses command line (not lsof) to avoid false positives from Docker/OrbStack
# helpers that have open file descriptors into the repo via volume mounts.
is_repo_process() {
  local pid=$1
  ps -p "$pid" -o command= 2>/dev/null | grep -qF "$REPO_ROOT"
}

# --- Phase 1: Kill by port ---------------------------------------------------
PORTS=()
for id in $(seq 0 9); do
  compute_ports "$id"
  PORTS+=("$DEV_WEB_PORT" "$ZERO_PORT")
  # zero-cache spawns internal workers on adjacent ports (e.g. change-streamer on +1)
  PORTS+=("$((ZERO_PORT + 1))" "$((ZERO_PORT + 2))")
done
PORTS+=(3100) # email dev (fixed port, no worktree offset)

# Deduplicate
PORTS=($(printf '%s\n' "${PORTS[@]}" | sort -un))

echo "Phase 1: Killing processes on dev ports..."
for port in "${PORTS[@]}"; do
  for pid in $(lsof -ti:"$port" 2>/dev/null || true); do
    if is_repo_process "$pid"; then
      kill_pid "$pid" "port $port"
    fi
  done
done

# --- Phase 2: Kill portless zombies by command pattern ------------------------
echo "Phase 2: Killing portless zombie processes..."
for pattern in "zero-cache-dev" "vite.*dev" "email dev"; do
  for pid in $(pgrep -f "$pattern" 2>/dev/null || true); do
    # Skip ourselves
    [ "$pid" = "$$" ] && continue
    # Only kill processes belonging to this repo
    if is_repo_process "$pid"; then
      kill_pid "$pid" "pattern '$pattern'"
    fi
  done
done

# --- Phase 2b: Kill processes holding SQLite lock files -----------------------
echo "Phase 2b: Killing processes holding pi-dash SQLite locks..."
for pid in $(lsof -t /tmp/pi-dash*.db* 2>/dev/null || true); do
  [ "$pid" = "$$" ] && continue
  kill_pid "$pid" "SQLite lock holder"
done

# --- Phase 3: Clean stale SQLite lock files -----------------------------------
echo "Phase 3: Cleaning stale SQLite files..."
rm -f /tmp/pi-dash*.db* 2>/dev/null || true

# --- Summary ------------------------------------------------------------------
if [ "$KILLED" -eq 0 ]; then
  echo "No dev processes found."
else
  echo "Killed $KILLED process(es)."
fi
