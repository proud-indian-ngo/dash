---
name: worktree-dev
description: Use when setting up, managing, or troubleshooting git worktrees for parallel development. Covers port allocation, isolated DBs, and auto-detection.
---

# Worktree Development

This project supports parallel development via git worktrees with automatic port isolation.

## Quick Start

```bash
# Create a worktree and set it up
git worktree add .worktrees/my-feature -b my-feature
cd .worktrees/my-feature
bun run worktree:setup 1          # ID 1-9, assigns unique ports
bun run dev                        # Starts on :3011 (ID=1)

# For schema-changing work (separate Postgres)
bun run worktree:setup 2 --isolated-db

# Teardown
bun run worktree:teardown
cd ../..
git worktree remove .worktrees/my-feature
```

## Auto-detection (for AI agents)

When using `claude --worktree` or `isolation: "worktree"`, ports are auto-computed from a hash of the worktree path — no manual setup needed. The `packages/env/src/index.ts` loader detects the worktree and injects port overrides into `process.env`.

## Port Allocation (base + ID x 10)

| Service         | ID=0 (main) | ID=1 | ID=2 |
|-----------------|-------------|------|------|
| Vite dev        | 3001        | 3011 | 3021 |
| Zero cache      | 4848        | 4858 | 4868 |
| E2E web         | 3099        | 3109 | 3119 |
| E2E Zero        | 4870        | 4880 | 4890 |
| E2E test DB     | 5433        | 5443 | 5453 |

## Key Files

- `scripts/worktree-setup.sh` — generates `.env.worktree` with port overrides
- `scripts/worktree-teardown.sh` — cleans up worktree resources
- `scripts/worktree-ports.sh` — shared port computation (sourced by other scripts)
- `packages/env/src/index.ts` — auto-detects worktree and injects port overrides
- `.worktreeinclude` — tells Claude Code to copy `.env` into new worktrees
- `lefthook.yml` `post-checkout` hook — copies `.env` + runs `ruler:apply` for any agent

## Shared vs Isolated DB

- Default: All worktrees share the dev Postgres on port 5432 (fine for non-schema work)
- `--isolated-db` flag: Creates a dedicated Postgres for schema-changing branches
