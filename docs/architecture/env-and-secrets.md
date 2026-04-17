# Environment & Secrets

> **Load when**: `packages/env`, `.env`, `.env.worktree`, worktree port collision, `BETTER_AUTH_SECRET`, `createEnv`, `@t3-oss/env-core`, env validation, `VITE_*` vars, multi-worktree dev setup.
> **Related**: `monorepo.md`, `data-layer.md`, `auth.md`

## Layered Loading

`packages/env/src/index.ts` runs at import-time, before any env validation. Three layers, in order:

1. **Layer 0 — base `.env`**: `findUp(".env")` from cwd, loaded via `dotenv` + `dotenv-expand`.
2. **Layer 1 — explicit `.env.worktree` override**: `findUp(".env.worktree")`. Overrides base. Skipped if `VITE_E2E` is set — `run-e2e.sh` already injected correct E2E ports and worktree values would clobber them.
3. **Layer 2 — auto-detected worktree ports**: only runs when `WORKTREE_ID` not set AND `.env.worktree` not found. Triggers `autoDetectWorktreePorts()`.

## Worktree Auto-Detect

Runs in git worktrees that weren't explicitly set up. Goal: make `claude --worktree` and agent `isolation: "worktree"` just work.

1. Fast path: read `.worktree-id` file if present (1-9 range).
2. Slow path: `git rev-parse --show-toplevel` + `git worktree list --porcelain`. If current path == main worktree, abort (not in a worktree).
3. Compute deterministic ID via `cksum` (CRC-32) over toplevel path + newline, mod 9, +1.
4. Derive ports: `webPort = 3001 + id*10`, `zeroPort = 4848 + id*10`. Set `DEV_WEB_PORT`, `ZERO_PORT`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `ZERO_MUTATE_URL`, `ZERO_QUERY_URL`, `VITE_ZERO_URL`, `ZERO_REPLICA_FILE`, `ZERO_APP_ID` — all with `??=` (don't override).

**Collision warning**: only 9 IDs. Two worktrees have ~11% hash collision chance. For reliable isolation use `bun run worktree:setup <ID>` (writes `.env.worktree`).

## Schema Split

Two Zod-validated env contracts via `@t3-oss/env-core`:

- **`packages/env/src/server.ts`** — server-only secrets. Includes `DATABASE_URL`, `BETTER_AUTH_SECRET` (min 32 chars), SMTP, R2 credentials, WhatsApp, Immich API keys.
- **`packages/env/src/web.ts`** — client-visible `VITE_*` vars only. Enforces public/private split at the type level.

Both import `./index` as a side-effect so tiered loading runs before validation.

**Conditional required**: `DEV_DB_HOST`, `DEV_DB_PASSWORD` required only when `NODE_ENV === "development"`.

**Defaults baked into schema**: `GRAVATAR_API_BASE_URL`, `GRAVATAR_TIMEOUT_MS`, `SMTP_PORT: 587`, `ZERO_MUTATE_FORWARD_COOKIES: "true"`, `APP_NAME: "Proud Indian Dashboard"`.

## `SKIP_VALIDATION` / `VITE_E2E`

- `SKIP_VALIDATION`: bypass t3-env validation — used by Dockerfile build stage where runtime env isn't present at build time.
- `VITE_E2E`: short-circuits Layer 1 override. E2E runner injects its own ports.

## Dev vs Prod

- Dev: `.env` + optional `.env.worktree`. Auto-detect fills gaps.
- CI/E2E: `.env` + `VITE_E2E=1` + ports from `run-e2e.sh`.
- Prod: env injected by host (Docker / cloud provider). No `.env` files.

## Import Rule

- Server-only code: `import { env } from "@pi-dash/env/server"`.
- Client code: `import { env } from "@pi-dash/env/web"` — only `VITE_*` keys exposed.
- Never import `@pi-dash/env/server` from client code — leaks secrets into bundle.
