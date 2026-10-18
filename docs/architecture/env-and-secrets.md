# Environment and secrets

> **Load when**: `packages/env`, `.env`, `.env.worktree`, worktree port collisions, env validation, `VITE_*` variables.
> **Related**: `monorepo.md`, `data-layer.md`, `auth.md`

The full variable list is in [DEPLOYMENT.md](../../DEPLOYMENT.md#environment-variables). This chapter covers how variables load and validate.

## Loading order

`packages/env/src/index.ts` runs on import, before validation:

1. Base `.env`, found by walking up from the working directory.
2. `.env.worktree`, written by `bun run worktree:setup`, overrides `.env`. A variable set explicitly in the environment wins over both, even when empty, so `DATABASE_URL=... bun run <script>` uses that URL and `run-e2e.sh` can blank secrets such as `RESEND_API_KEY`. A `process.env` value identical to the file's value counts as loaded from the file, because Bun pre-loads `.env` and `--env-file` files. Skipped when `VITE_E2E` is set, since `run-e2e.sh` already exported E2E ports.
3. Auto-detected worktree ports, only when neither `WORKTREE_ID` nor `.env.worktree` exists.

`envSource(name)` reports where a value came from. Production has no `.env` files; the host injects variables.

## Worktree ports

Auto-detection lets agent worktrees run without setup. The ID comes from `.worktree-id` (1–9) or, in a linked worktree, a checksum of the path, matching `scripts/worktree-ports.sh`. Ports are `3001 + id*10` for web and `4848 + id*10` for Zero. Values already set win.

Only nine IDs exist, so two auto-detected worktrees collide about 11% of the time. Use `bun run worktree:setup <ID>` for reliable isolation, with `--isolated-db` for a separate database.

## Server and web contracts

- `@pi-dash/env/server` holds every server variable, including secrets. Importing it from client code leaks secrets into the bundle.
- `@pi-dash/env/web` holds `VITE_*` variables only and is safe for client code.

Both treat empty strings as unset. Without `RESEND_API_KEY` and `EMAIL_FROM`, email is skipped with an `email_not_configured` warning. `SKIP_VALIDATION=true` bypasses validation; the Docker build sets it.

## Secret handling

- Keep real values in `.env` or the host's environment. `.env.sample` holds names and sample values only.
- `DATA_ENCRYPTION_KEY` encrypts finance-private fields (`packages/db/src/encryption.ts`) and keys contribution-import and bank-statement hashes. Outside production the hashes fall back to a key derived from `BETTER_AUTH_SECRET`. Changing the key, or moving from the fallback to a real key, silently changes the hashes: re-uploads without an external ID column stop matching, and rows with external IDs show as changed. The `h1:` prefix names the scheme, not the key, so there is no rotation path. See "Import hashes and the key" in `finance-income.md`.
- Scripts that write encrypted values must run with the production key.
