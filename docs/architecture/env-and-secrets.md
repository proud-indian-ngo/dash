# Environment and secrets

> **Load when**: `packages/env`, `.env`, `.env.worktree`, worktree port collisions, `createEnv`, env validation, `VITE_*` variables, multi-worktree setup.
> **Related**: `monorepo.md`, `data-layer.md`, `auth.md`

The full variable list is in [DEPLOYMENT.md](../../DEPLOYMENT.md#environment-variables). This chapter covers how variables load and validate.

## Loading order

`packages/env/src/index.ts` runs on import, before validation:

1. Base `.env`, found by walking up from the working directory, loaded with `dotenv` and `dotenv-expand` (`load-env-files.ts`).
2. `.env.worktree`, written by `bun run worktree:setup`, overrides `.env`. A variable set explicitly in the environment wins over both, so `DATABASE_URL=... bun run <script>` uses that URL. A `process.env` value identical to the file's value counts as loaded from the file, because Bun pre-loads `.env` and `--env-file` files. Skipped when `VITE_E2E` is set, since `run-e2e.sh` already exported E2E ports.
3. Auto-detected worktree ports, only when neither `WORKTREE_ID` nor `.env.worktree` exists.

`envSource(name)` from `@pi-dash/env` reports whether a value came from the environment, `.env.worktree` or `.env`. Production has no `.env` files; the host injects variables.

## Worktree ports

Auto-detection lets `claude --worktree` and agent worktrees run without setup:

1. Read `.worktree-id` (1–9) if present. Otherwise compare `git rev-parse --show-toplevel` with the main worktree and, in a linked worktree, take the `cksum` of the path plus newline, mod 9, plus 1. This matches `scripts/worktree-ports.sh`.
2. With that ID, set `WORKTREE_ID`, `DEV_WEB_PORT` (`3001 + id*10`), `ZERO_PORT` (`4848 + id*10`), `BETTER_AUTH_URL`, `CORS_ORIGIN`, `ZERO_MUTATE_URL`, `ZERO_QUERY_URL`, `VITE_ZERO_URL`, `ZERO_REPLICA_FILE` and `ZERO_APP_ID`. Each uses `??=`, so existing values win.

Only nine IDs exist, so two auto-detected worktrees collide about 11% of the time. Use `bun run worktree:setup <ID>` for reliable isolation, with `--isolated-db` for a separate database.

## Server and web contracts

Both use `@t3-oss/env-core` with Zod, treat empty strings as unset, and import `./index` first so loading runs before validation.

- `@pi-dash/env/server` (`server.ts`): every server variable, including secrets. Server code only; importing it from client code leaks secrets into the bundle.
- `@pi-dash/env/web` (`web.ts`): `VITE_*` variables only, enforced by `clientPrefix`. Safe for client code.

Conditional rules:

- `DEV_DB_HOST` and `DEV_DB_PASSWORD` are required when `NODE_ENV=development`.
- `RESEND_API_KEY`, `EMAIL_FROM` and `DATA_ENCRYPTION_KEY` are required when `NODE_ENV=production`. Without the Resend pair, email is skipped with an `email_not_configured` warning.
- `WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID` is required when `WHATSAPP_CLOUD_ACCESS_TOKEN` is set.
- `RAZORPAY_KEY_ID` must start `rzp_live_` or `rzp_test_`; `DATA_ENCRYPTION_KEY` must decode to 32 bytes; `SOCIAL_MEDIA_SIGNING_SECRET` needs 32+ characters.

`SKIP_VALIDATION=true` bypasses validation. The Docker build stage sets it because runtime variables are absent at build time.

## Secret handling

- Keep real values in `.env` or the host's environment. `.env.sample` holds names and sample values only.
- `DATA_ENCRYPTION_KEY` encrypts finance-private fields (`packages/db/src/encryption.ts`) and keys contribution-import and bank-statement hashes. Outside production the hashes fall back to a key derived from `BETTER_AUTH_SECRET`. Changing the key, or moving from the fallback to a real key, silently changes the hashes: re-uploads without an external ID column stop matching, and rows with external IDs show as changed. The `h1:` prefix names the scheme, not the key, so there is no rotation path. See "Import hashes and the key" in `finance-income.md`.
- Scripts that write encrypted values must run with the production key.
