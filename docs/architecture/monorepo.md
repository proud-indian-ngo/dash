# Monorepo

> **Load when**: new workspace, package layout, Turborepo, Dockerfile, build topology.
> **Related**: `data-layer.md`, `jobs.md`

Turborepo with Bun workspaces.

| Package | Purpose |
|---|---|
| `apps/web` | TanStack Start app: SSR, file-based routes, server functions |
| `packages/auth` | Better Auth config, admin seed script |
| `packages/config` | Shared TypeScript and tooling config |
| `packages/db` | Drizzle schema, migrations, local Docker Compose (Postgres, WhatsApp) |
| `packages/design-system` | shadcn/ui and reui components, theme provider |
| `packages/e2e` | Playwright E2E tests |
| `packages/editor` | Plate rich-text editor (`editor` and `renderer` exports) |
| `packages/email` | React Email templates and Resend transport |
| `packages/env` | Zod-validated env contracts (`server.ts`, `web.ts`) |
| `packages/jobs` | pg-boss handlers and `enqueue()` |
| `packages/notifications` | Inbox, email and WhatsApp delivery |
| `packages/observability` | `withTaskLog`, `withFireAndForgetLog` |
| `packages/pdf` | React-PDF documents (vouchers, receipts, ID cards) |
| `packages/shared` | Client-safe constants, types and utilities |
| `packages/whatsapp` | GoWA gateway and Cloud API clients |
| `packages/zero` | Zero schema, queries, mutators, permissions |

## Adding a workspace

Add `COPY packages/<name>/package.json packages/<name>/` to the `Dockerfile` copy layer before `RUN bun install`, or the Docker build breaks.

## Docker build

- `bun install` runs with `--frozen-lockfile --ignore-scripts`. `@rocicorp/zero-sqlite3` would otherwise compile a native addon, and the slim image has no Python or g++. The web build and migrator never load it.
- zero-cache runs from the `rocicorp/zero` image. Keep it on the same minor as the `@rocicorp/zero` catalog version.
- Stages: `source` (install and copy), `build` (Vite, with `VITE_*` build arguments and `SKIP_VALIDATION=true`), `migrator` (dependencies and `packages/db` only) and `production` (`apps/web/.output`).

## Web compilation

`apps/web/vite.config.ts` uses `src/lib/dev/react-compiler-preset.ts` to exclude ReUI's `data-grid-table.tsx` and `data-grid-table-dnd.tsx` from React Compiler. They read column widths and pin offsets through stable references to mutable TanStack state, so compiler caching leaves stale geometry after resizing or pinning. Keep the exclusion until upstream is compiler-safe, and verify changes against real browser geometry.

Table sizing lives in `components/data-table/column-fill.ts` and `use-column-fill.ts`. The last visible unpinned column absorbs spare width; viewport-derived fill is never persisted. The filler never shrinks below the remaining space but may grow into overflow. With no unpinned column, or a limiting maximum width, spare space may remain.

## Dev tooling

- Biome with the Ultracite preset (`biome.jsonc`): `bun run check` validates, `bun run fix` fixes.
- Lefthook (`lefthook.yml`): pre-commit runs `oxfmt` and `oxlint --fix` on staged files, affected type checks and unit tests, `bun run check` when manifests change, and `check:docs` (word budgets) when Markdown changes. Post-checkout copies `.env` from the main worktree when missing and reruns `bun run ruler:apply` when `CLAUDE.md` is missing or older than `.ruler/agent-guide.md`.
- Commitlint (`commitlint.config.js`) enforces conventional commits.
- Knip (`knip.json`) checks unused exports and dependencies via `bun run check:unused`.
- Turborepo (`turbo.json`) orchestrates tasks with a self-hosted remote cache at `turbo.ducktors.dev`.
