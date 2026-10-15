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

- **`packages/env/src/server.ts`** — server-only secrets. Includes `DATABASE_URL`, `BETTER_AUTH_SECRET` (min 32 chars), `DATA_ENCRYPTION_KEY` (optional base64 32-byte key for finance-private fields, see `packages/db/src/encryption.ts`; it also keys the contribution-import hashes, which outside production fall back to a key derived from `BETTER_AUTH_SECRET`. Switching from that fallback to `DATA_ENCRYPTION_KEY`, or changing the production key, silently changes those hashes: re-uploads of files without an external ID column stop being recognised as already imported, and rows with external IDs show as "changed since imported" conflicts. The `h1:` prefix on the hashes names the scheme, not the key, so there is no rotation path; see "Import hashes and the key" in `finance-and-programmes.md`), `OLD_DATA_ENCRYPTION_KEY` (optional; only for `bun run secrets:check` and `secrets:rekey`, which find and re-encrypt values written under a previous key, see "Encryption key mismatch: check and rekey" in `DEPLOYMENT.md`), Resend, R2 credentials, WhatsApp, Immich API keys.
- **`packages/env/src/web.ts`** — client-visible `VITE_*` vars only. Enforces public/private split at the type level.

Both import `./index` as a side-effect so tiered loading runs before validation.

**Conditional required**: `DEV_DB_HOST`, `DEV_DB_PASSWORD` required only when `NODE_ENV === "development"`. `RESEND_API_KEY`, `EMAIL_FROM` and `DATA_ENCRYPTION_KEY` required only when `NODE_ENV === "production"`; without the Resend pair, emails are skipped with an `email_not_configured` warning. `RESEND_WEBHOOK_SECRET` is optional; without it `/api/email/webhook` answers 503 and bounces aren't recorded.

**Defaults baked into schema**: `GRAVATAR_API_BASE_URL`, `GRAVATAR_TIMEOUT_MS`, `ZERO_MUTATE_FORWARD_COOKIES: "true"`, `APP_NAME: "Proud Indian Dashboard"`.

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
