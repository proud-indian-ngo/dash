# Monorepo

> **Load when**: new workspace, package layout, Turborepo, Dockerfile, build topology.
> **Related**: `data-layer.md`, `jobs.md`

Turborepo monorepo. Bun package manager.

| Package | Purpose |
|---|---|
| `apps/web` | Full-stack app — React + TanStack Start (SSR, file-based routing) |
| `packages/auth` | Better Auth config, admin seed script |
| `packages/db` | Drizzle ORM schema, migrations, Docker Compose (Postgres, WhatsApp) |
| `packages/email` | React Email templates + Nodemailer transport |
| `packages/env` | Zod-validated env contracts (`server.ts`, `web.ts`) via t3-env |
| `packages/config` | Shared TypeScript & tooling config |
| `packages/design-system` | shadcn/ui + reui components, theme provider |
| `packages/editor` | Plate.js rich-text editor (`editor` + `renderer` exports) |
| `packages/jobs` | pg-boss handlers + `enqueue()` |
| `packages/notifications` | Courier multi-channel notifications |
| `packages/observability` | `withTaskLog`, `withFireAndForgetLog` |
| `packages/pdf` | React-PDF voucher generation |
| `packages/shared` | Client-safe constants, types, utilities |
| `packages/whatsapp` | Self-hosted WhatsApp gateway client |
| `packages/zero` | Rocicorp Zero — schema, queries, mutators, permissions |
| `packages/e2e` | Playwright E2E tests |

## New Workspace Rule

New `packages/*`: add `COPY packages/<name>/package.json packages/<name>/` to `Dockerfile` before `RUN bun install`. Else Docker build breaks.

## Dev Tooling

- **Biome + ultracite** (`biome.jsonc`): linter + formatter. `bun run check` validates, `bun run fix` auto-fixes. Ultracite = preset on top of Biome with opinionated React/TS rules.
- **Lefthook** (`lefthook.yml`): git hooks.
  - `pre-commit` (parallel): type check, `ultracite fix {staged_files}` with `stage_fixed: true`, unit tests, `check:unused` (knip).
  - `post-checkout` — on worktree switch: copies `.env` from main worktree if missing; re-runs `bun run ruler:apply` if `CLAUDE.md` missing or older than `.ruler/agent-guide.md`.
- **Commitlint** (`commitlint.config.js`): enforces conventional commits (`feat:`, `fix:`, `docs:`, etc).
- **Knip** (`knip.json`): unused exports/dependencies check via `bun run check:unused`.
- **Turborepo** (`turbo.json`): task orchestration + remote cache (self-hosted at `turbo.ducktors.dev`).
