#!/bin/bash

port_listener_pids() {
  lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

stop_port_processes() {
  local port="$1"
  local pids

  pids="$(port_listener_pids "$port")"
  if [ -z "$pids" ]; then
    return
  fi

  echo "Stopping listener processes on port $port: $pids"
  kill -TERM $pids 2>/dev/null || true
  sleep 1

  pids="$(port_listener_pids "$port")"
  if [ -n "$pids" ]; then
    echo "Force-stopping listener processes on port $port: $pids"
    kill -KILL $pids 2>/dev/null || true
    sleep 1
  fi

  pids="$(port_listener_pids "$port")"
  if [ -n "$pids" ]; then
    echo "ERROR: listener processes still hold port $port: $pids"
    return 1
  fi
}

cleanup_on_exit() {
  local exit_code=$?

  trap - EXIT
  if ! cleanup && [ "$exit_code" -eq 0 ]; then
    exit_code=1
  fi
  exit "$exit_code"
}

# One run-e2e.sh per checkout. Runs in the same checkout share the production
# build in apps/web/.output (its client bakes in the stack's Zero URL), the
# saved logins in packages/e2e/.auth, and Playwright's test-results and report
# folders, so a second run would overwrite what the first is serving and
# reading. run-two-stacks.ts gives each stack its own snapshot, so it still runs
# stacks in parallel.
E2E_RUN_LOCK_DIR=""
E2E_RUN_LOCK_PID=""

# The current process's pid, also inside subshells, where $$ is the parent's.
# macOS ships bash 3.2, which has no $BASHPID.
current_shell_pid() {
  sh -c 'echo $PPID'
}

acquire_e2e_run_lock() {
  local lock_dir="$1"
  local waited=0
  local holder

  while ! mkdir "$lock_dir" 2>/dev/null; do
    holder="$(cat "$lock_dir/pid" 2>/dev/null || true)"
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      echo "Removing stale E2E run lock from exited process $holder"
      rm -rf "$lock_dir"
      continue
    fi
    if [ "$waited" -eq 0 ]; then
      echo "Another E2E run (pid ${holder:-unknown}) is using this checkout; waiting for it to finish..."
    fi
    sleep 5
    waited=$((waited + 5))
  done
  current_shell_pid > "$lock_dir/pid"
  E2E_RUN_LOCK_PID="$(cat "$lock_dir/pid")"
  E2E_RUN_LOCK_DIR="$lock_dir"
  if [ "$waited" -gt 0 ]; then
    echo "Waited ${waited}s for the previous E2E run."
  fi
}

release_e2e_run_lock() {
  if [ -n "$E2E_RUN_LOCK_DIR" ] && [ "$(cat "$E2E_RUN_LOCK_DIR/pid" 2>/dev/null)" = "$E2E_RUN_LOCK_PID" ]; then
    rm -rf "$E2E_RUN_LOCK_DIR"
  fi
  E2E_RUN_LOCK_DIR=""
  E2E_RUN_LOCK_PID=""
}
