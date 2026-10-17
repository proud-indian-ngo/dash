# Monorepo

> **Load when**: new workspace, Turborepo, Dockerfile, build topology.
> **Related**: `data-layer.md`, `jobs.md`, `project-structure.md`

Turborepo with Bun workspaces. `project-structure.md` maps the packages.

## Adding a workspace

Add `COPY packages/<name>/package.json packages/<name>/` to the `Dockerfile` copy layer before `RUN bun install`, or the Docker build breaks.

## Docker build

- `bun install` runs with `--ignore-scripts`. `@rocicorp/zero-sqlite3` would otherwise compile a native addon, and the slim image has no Python or g++. The web build and migrator never load it.
- zero-cache runs from the `rocicorp/zero` image. Keep it on the same minor as the `@rocicorp/zero` catalog version.
- The build stage sets `SKIP_VALIDATION=true` because runtime variables are absent at build time.

## Web compilation

`apps/web/vite.config.ts` excludes ReUI's `data-grid-table.tsx` and `data-grid-table-dnd.tsx` from React Compiler. They read column widths and pin offsets through stable references to mutable TanStack state, so compiler caching leaves stale geometry after resizing or pinning. Keep the exclusion until upstream is compiler-safe, and verify changes against real browser geometry.

In table sizing (`components/data-table/column-fill.ts`), the last visible unpinned column absorbs spare width. Viewport-derived fill is never persisted.

## Dev tooling

Lefthook's post-checkout hook, in a linked worktree, copies `.env` from the main worktree when missing and reruns `bun run ruler:apply` when `CLAUDE.md` is missing or older than `.ruler/agent-guide.md`.
