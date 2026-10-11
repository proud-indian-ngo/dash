#!/usr/bin/env bash
# Runs the web unit suite in directory chunks so each bun test process's
# memory high-water resets between chunks (bun keeps isolate memory resident
# within one process; a single run of all 95 files peaks at ~1.3 GB).
set -e
cd "$(dirname "$0")"

# Bun occasionally hangs partway through a chunk, on a different file each
# time, and used to sit there until CI's step timeout. A chunk that prints
# nothing for STALL_SECONDS is killed and run once more.
STALL_SECONDS="${STALL_SECONDS:-120}"

run_once() {
  local log offset=0 idle=0 size pid status=0
  log="$(mktemp)"
  bun test --env-file ../../.env --env-file ../../.env.worktree --isolate "$@" >"$log" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    sleep 2
    size=$(wc -c <"$log" | tr -d ' ')
    if [ "$size" -gt "$offset" ]; then
      tail -c "+$((offset + 1))" "$log" | head -c "$((size - offset))"
      offset=$size
      idle=0
    else
      idle=$((idle + 2))
      if [ "$idle" -ge "$STALL_SECONDS" ]; then
        echo "No output for ${STALL_SECONDS}s, killing: bun test $*" >&2
        pkill -KILL -P "$pid" 2>/dev/null || true
        kill -KILL "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        rm -f "$log"
        return 124
      fi
    fi
  done
  wait "$pid" || status=$?
  tail -c "+$((offset + 1))" "$log"
  rm -f "$log"
  return "$status"
}

run_chunk() {
  local status=0
  run_once "$@" || status=$?
  if [ "$status" -eq 124 ]; then
    echo "Retrying: bun test $*" >&2
    run_once "$@"
  else
    return "$status"
  fi
}

for d in src/lib src/components src/routes src/functions src/hooks; do
  if [ "$d" = src/lib ]; then
    # These files intermittently stall after earlier lib tests in Bun (the
    # ID-card one on CI). Run each in a fresh process to keep their coverage.
    run_chunk --path-ignore-patterns '**/kalakriti-food-route.test.ts' --path-ignore-patterns '**/kalakriti-id-card-data.test.ts' "$d"
    run_chunk src/lib/kalakriti-food-route.test.ts
    run_chunk src/lib/server/kalakriti-id-card-data.test.ts
  else
    run_chunk "$d"
  fi
done
