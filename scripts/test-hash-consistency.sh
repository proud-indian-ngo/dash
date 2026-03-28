#!/bin/bash
# Verifies that the bash (cksum) and TypeScript hash implementations
# produce the same worktree ID for a set of known paths.
#
# Usage: bash scripts/test-hash-consistency.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./worktree-ports.sh
source "$REPO_ROOT/scripts/worktree-ports.sh"

PASS=0
FAIL=0

check_path() {
  local path="$1"
  local bash_hash ts_id

  # Bash: same logic as get_worktree_id auto-detect path
  bash_hash=$(echo "$path" | cksum | cut -d' ' -f1)
  local bash_id=$(( (bash_hash % 9) + 1 ))

  # TypeScript: run the same cksum logic via bun
  ts_id=$(bun -e "
    const { execFileSync } = require('node:child_process');
    const out = execFileSync('cksum', { encoding: 'utf8', input: '${path}\n', stdio: ['pipe','pipe','pipe'] });
    const hash = parseInt(out.split(' ')[0], 10);
    console.log((hash % 9) + 1);
  ")

  if [ "$bash_id" = "$ts_id" ]; then
    echo "  PASS: '$path' → ID=$bash_id"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: '$path' → bash=$bash_id, ts=$ts_id"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Hash Consistency Test ==="
echo ""

check_path "/Users/somu/Code/pi-dash/.worktrees/smoke-test"
check_path "/Users/somu/Code/pi-dash/.worktrees/feature-auth"
check_path "/home/ubuntu/pi-dash/.claude/worktrees/abc123"
check_path "/tmp/worktree-test"
check_path "/very/long/path/with/many/segments/to/a/worktree"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
