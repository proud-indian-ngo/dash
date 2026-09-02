#!/usr/bin/env bash
# Runs the web unit suite in directory chunks so each bun test process's
# memory high-water resets between chunks (bun keeps isolate memory resident
# within one process; a single run of all 95 files peaks at ~1.3 GB).
set -e
cd "$(dirname "$0")"
for d in src/lib src/components src/routes src/functions src/hooks; do
  bun test --env-file ../../.env --env-file ../../.env.worktree --isolate "$d"
done
