# E2E Testing

> **Load when**: `packages/e2e`, Playwright tests, `global-setup`, seed helpers, test fixtures, `.auth` state, shard-by-duration, `run-e2e.sh`, E2E DB isolation, `duration-reporter`, flaky tests, test-user seeding.
> **Related**: `data-layer.md`, `env-and-secrets.md`, `monorepo.md`

## Layout

```
packages/e2e/
├── .auth/              # storageState per role (admin.json, volunteer.json)
├── fixtures/           # Custom Playwright fixtures
├── helpers/            # seed-dev-data.ts (31+ fns), seed-test-user.ts
├── pages/              # Page objects
├── tests/              # Specs by feature
├── global-setup.ts     # Authenticates admin + volunteer, saves storageState
├── playwright.config.ts
├── duration-reporter.ts
├── shard-by-duration.ts
├── run-e2e.sh          # Full-stack orchestration
├── .env.test           # E2E-only env
└── .test-durations.json  # Historical timings for sharding
```

## Global Setup

`global-setup.ts` runs once per Playwright worker spin-up:

1. Loads `.env.test` with `dotenv`.
2. Logs in as admin + volunteer via UI (`/login` → fill → submit → wait for `/`).
3. Saves `storageState` to `.auth/admin.json` + `.auth/volunteer.json`.
4. Tests reference the state via `test.use({ storageState: "..." })`.

Response logging inside `authenticate()` hooks `page.on("response")` for `/api/auth/*` — helps debug CI auth failures.

## Seed Strategy

`helpers/seed-dev-data.ts` (31+ functions) is the canonical seeder. Used by:
- `run-e2e.sh` before tests
- `bun run test:seed` for manual dev
- Individual test fixtures that need a specific entity

Functions are idempotent where possible (`onConflictDoNothing()`), return the inserted IDs. Never create stale data: each test relies on seed having run.

`helpers/seed-test-user.ts` covers the two canonical users (admin + volunteer) plus additional role fixtures.

**DB isolation**: `run-e2e.sh` bootstraps a separate Postgres via `packages/db/docker-compose.e2e*.yml`. Worktree-aware — port + DB name derived from `WORKTREE_ID` to avoid collision with dev DB.

## Sharding by Duration

`.github/workflows/ci.yml` splits E2E across 4 shards. Sharding is **duration-balanced**, not filename-alphabetical:

1. `prepare-shards` job runs `shard-by-duration.ts 4`.
2. Script reads `.test-durations.json` (produced by `duration-reporter.ts` during prior runs, cached between CI runs via `actions/cache`).
3. Greedy bin-packing (longest-processing-time-first) assigns specs to 4 `shard-lists/shard-{1..4}.txt` files.
4. Unknown tests default to 10-sec estimate.
5. Each shard job reads its list via Playwright's `--test-list` flag.

Cache key: `e2e-durations-${{ github.ref_name }}` with fallback to `e2e-durations-master`. New specs on feature branches inherit master's timing data.

## `run-e2e.sh`

Full-stack orchestration for local E2E:
- Starts Docker Compose (Postgres + Zero cache + WhatsApp gateway if enabled).
- Runs migrations + seed.
- Launches dev server.
- Runs `playwright test`.
- Tears down on exit.

Use `bun run test:e2e:ui` for interactive Playwright UI mode without the full bash harness.

## Page Objects

`pages/` holds page-object classes. Tests consume them for selector stability. New pages: add to `pages/`, export a class with `goto()` + action methods, don't inline selectors in tests.

## Durations Reporter

`duration-reporter.ts` is a Playwright reporter registered in `playwright.config.ts`. Writes each spec's duration to `.test-durations.json`. Committed to the repo so CI shards from historical data; updated by CI after every run via the cache.

## Auth Plugins and E2E

Sign-up is disabled in production, so E2E seeds users directly via `seed-test-user.ts` (bypasses Better Auth's admin-creates-user flow). Email verification is pre-satisfied in the seed.
