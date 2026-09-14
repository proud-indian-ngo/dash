# E2E Testing

> **Load when**: `packages/e2e`, Playwright tests, `global-setup`, seed helpers, test fixtures, `.auth` state, shard-by-duration, `run-e2e.sh`, E2E DB isolation, `duration-reporter`, flaky tests, test-user seeding.
> **Related**: `data-layer.md`, `env-and-secrets.md`, `monorepo.md`

## Layout

```
packages/e2e/
├── .auth/              # storageState per shared role and active Kalakriti actor
├── fixtures/           # Custom Playwright fixtures
├── helpers/            # seed-dev-data.ts (31+ fns), seed-test-user.ts
├── pages/              # Page objects
├── tests/              # Specs by feature
├── global-setup.ts     # Authenticates shared roles + active Kalakriti actors
├── playwright.config.ts
├── project-selection.ts # Role-only and release-invariant spec filters
├── duration-reporter.ts
├── shard-by-duration.ts
├── run-e2e.sh          # Full-stack orchestration
├── run-two-stacks.ts   # Opt-in two-stack benchmark
├── partition-specs.ts  # Whole-file duration balancing
├── stack-workspace.ts  # Source snapshots and dependency/cache isolation
├── .env.test           # E2E-only env
└── .test-durations.json  # Historical timings for sharding
```

## Global Setup

The `setup` project runs once per Playwright invocation, before its dependent projects. Each CI shard invokes it separately:

1. Loads `.env.test` with `dotenv`.
2. Signs in the shared global roles and active Kalakriti release actors through Playwright's API `request` fixture. Each actor uses a distinct `192.0.2.x` `x-forwarded-for` test address so setup does not consume the normal browser login tests' localhost rate-limit bucket if rate limiting is enabled.
3. Saves `request.storageState()` for each active actor under `.auth/`. Dormant actors intentionally have no state.
4. Tests reference the state via `test.use({ storageState: "..." })`.

`authenticate()` logs each sign-in response status and URL, and retries only a bounded 429 response.

The shared fixture listens for browser errors only when a test requests `page`. API-only authorization and object-access tests use Playwright's `request` fixture, so they exercise the live HTTP/Zero authorization path without creating a browser page. UI tests still annotate uncaught page errors.

## Seed Strategy

`helpers/seed-dev-data.ts` (31+ functions) is the canonical seeder. Used by:
- `run-e2e.sh` before tests
- `bun run test:seed` for manual dev
- Individual test fixtures that need a specific entity

Functions are idempotent where possible (`onConflictDoNothing()`), return the inserted IDs. Never create stale data: each test relies on seed having run.

`helpers/seed-test-user.ts` covers the canonical global users and invokes `helpers/kalakriti-release-fixture.ts` for the deterministic Registration Release role, cross-Edition, cross-Center, privacy, and race fixtures.

**DB isolation**: `run-e2e.sh` bootstraps a separate Postgres via `packages/db/docker-compose.e2e*.yml`. Worktree-aware — port + DB name derived from `WORKTREE_ID` to avoid collision with dev DB.

## Kalakriti global invariants

Public schedule, database race, JSON operation, and sidebar Center scan tests run only in the `kalakriti_release_invariants` project with one worker. This project is queued before the other authenticated projects so its serial work overlaps their execution. They share the database-wide single-live-Edition constraint, so distinct fixture IDs alone don't isolate them. Keep new live-Edition tests in this lane and add their files to `project-selection.ts` so role projects exclude them. `operations-person-qr.spec.ts` and `event-day-transport.spec.ts` override the lane's default storage state with the super-admin actor while testing additional scoped actors in separate browser contexts. The transport fixture uses isolated Edition 2166 and its own Guardian identity. `event-day-stations.spec.ts` also runs in this serialized lane, using isolated live Edition 2168 and draft Edition 2169 for role unions, check-in/meal eligibility, scoped attendance, cancelled sessions/Competitions, replay, and stale callbacks after activity changes. Camera frames are simulated at the decoder boundary; UI, Zero mutations, authorization, and database assertions use the real stack. Its three-Student fixture picks up two Students and leaves one absent, covering four Center sessions, absentee exclusion, complete-traveler finalization in later stages, derived vehicle history, single-Center name display, Student-versus-Center transport status updates, mobile modal persistence, camera fallback, and stale-frame protection. The deleted Event day route must return 404 for every role. Cleanup removes Center scan stages before Centers because their composite FK is restrictive. Parent transport-operation fixtures must finalize pickup and venue arrival before testing departure.

## Sharding by Duration

`.github/workflows/ci.yml` splits E2E across 4 shards. Sharding is **duration-balanced**, not filename-alphabetical:

1. `prepare-shards` job runs `shard-by-duration.ts 4`.
2. Script reads `.test-durations.json` (produced by `duration-reporter.ts` during prior runs, cached between CI runs via `actions/cache`).
3. Greedy bin-packing (longest-processing-time-first) assigns project-qualified test cases to 4 `shard-lists/shard-{1..4}.txt` files.
4. Unknown tests default to 10-sec estimate.
5. Each shard job reads its list via Playwright's `--test-list` flag.

Cache key: `e2e-durations-${{ github.ref_name }}` with fallback to `e2e-durations-master`. New specs on feature branches inherit master's timing data.

`project-selection.ts` excludes a role-only file from other role projects only when every test in that file belongs to one role. Shared multirole specs keep their project coverage. The duration reporter records both passed and runtime-skipped case durations; new cases still use the 10-second estimate.

## `run-e2e.sh`

Full-stack orchestration for local E2E:
- Starts isolated Postgres through Docker Compose, then migrates and seeds it.
- Starts Zero with `ZERO_LAZY_STARTUP=false` and waits for the root HTTP health response after its workers initialize.
- The optimized test runtime and CI set both `NODE_ENV=test` and `VITE_E2E=true`, raising the in-memory API budgets 100 times for shared E2E users. Normal production/development limits remain unchanged; unit tests cover their boundaries.
- Builds the optimized Nitro output with `NODE_ENV=production` and serves it with `NODE_ENV=test` by default, overlapping the build with Zero startup. The local test runtime keeps localhost WebSocket behavior; it does not verify deployment CSP. Set `E2E_SERVER=dev` to run against Vite dev instead. Local runs use at most four workers by default; pass `--workers` to override this.
- Local Zero runs in production mode with a test-only `ZERO_ADMIN_PASSWORD`, matching CI's inspector authentication requirement. Inspector-based tests authenticate with that environment value before querying state; they must not rely on the interactive password prompt or the development-mode bypass.
- Runs `playwright test`, reports environment-ready, Playwright, and total elapsed times, then tears down on exit.

Use `bun run test:e2e:ui` for interactive Playwright UI mode with the same full-stack harness and Vite dev, so app edits remain visible. UI/debug flags default to dev unless `E2E_SERVER` explicitly overrides it. `--list` and `--help` return without starting services.

## Two-stack benchmark

Run `bun run packages/e2e/run-two-stacks.ts` from the repository root to benchmark the complete suite across two independent local stacks. This is an opt-in experiment; the ordinary runner remains a single stack. Each child uses two workers, `--trace=off`, and `--retries=0`.

The coordinator snapshots tracked and nonignored working files, preserving uncommitted source changes. Each snapshot has its own `.auth`, app output, test results, and duration report. Workspace dependencies point into the snapshot; installed external packages use links to the existing installation. Writable `.nitro`, `.vite`, `.vite-temp`, and `.cache` directories must never be linked between snapshots. A shared Nitro directory can mix asset manifests from concurrent builds and serve missing JavaScript chunks.

`partition-specs.ts` groups all role/project cases for a spec file together, preserving serial and `beforeAll` dependencies. It balances invariant files first, then remaining files by historical worker time. The coordinator checks that the partition covers every selected non-setup row exactly once. Setup runs independently in each stack, adding twelve repeated authentication cases.

The child runner receives `E2E_STACK_INDEX=1|2` and allocates four reserved ports starting at `20000 + worktreeId * 100 + stackIndex * 10`: web, Zero, change streamer, and PostgreSQL. Container, Compose, volume, replica, and log names include the stack suffix. Occupied stack ports are rejected before startup. Each child tears down its services on exit; cancellation signals both process groups. The coordinator prints the private temporary directory containing snapshots, per-stack logs/JSON, partition data, and `summary.json`. Total time includes snapshot creation, both builds, setup, tests, and teardown.

Partition and snapshot-isolation tests run with the E2E package's unit-test command alongside the existing process-cleanup tests.

## Page Objects

`pages/` holds page-object classes. Tests consume them for selector stability. New pages: add to `pages/`, export a class with `goto()` + action methods, don't inline selectors in tests.

## Durations Reporter

`duration-reporter.ts` is a Playwright reporter registered in `playwright.config.ts`. It writes passed and skipped test-case durations to `.test-durations.json`; CI restores and updates this file through its cache for later shard balancing.

## Auth Plugins and E2E

Sign-up is disabled in production, so E2E seeds users directly via `seed-test-user.ts` (bypasses Better Auth's admin-creates-user flow). Email verification is pre-satisfied in the seed.

## Kalakriti data-scale benchmark

Run the opt-in synthetic workload from the repository root:

```bash
env -u ELECTRON_RUN_AS_NODE KALAKRITI_PERFORMANCE=true E2E_STACK_INDEX=2 \
  PLAYWRIGHT_HTML_OPEN=never bash packages/e2e/run-e2e.sh \
  tests/performance/kalakriti.spec.ts --project=super_admin --workers=1 --retries=0
```

The isolated stack runs `helpers/seed-kalakriti-performance.ts` and profiles Food memberships, Food students, the Students directory, Entries and available divisions as the seeded super-admin. Each query is analyzed three times after initial hydration. The Playwright report includes `kalakriti-performance.json` with dataset counts, server/total hydration timings, analyzer timings, read/scan counts and SQLite plans; it omits record contents and credentials. No timing threshold is enforced because local hardware and concurrent work vary.

The seed refuses non-loopback databases and any database name other than `pi-dash-test`. It uses a dedicated synthetic Edition and repeatable identifiers. The harness removes its disposable database on exit, preserving the regular development database. Add `--ui` to keep the test stack available while using Playwright UI; that mode defaults to the development server, so do not compare its timings directly with production-build runs.

Use the same seed, role, runtime and machine for before/after comparisons. Report analyzer execution separately from first hydration and browser navigation. Larger data reproduces query work, not production disk latency or CPU contention. The benchmark is skipped in ordinary CI unless explicitly enabled.

Initial local sample (2026-09-14, Zero 1.9.0, optimized app build): the fixture contains 10 Centers, 1,500 Students, 300 memberships, 600 assignments, 300 Guardian-Center links, 30 Divisions, 3,000 Entries and entry members, and 6,000 operations. Median analyzer times from three runs were:

| Query | Before admin shortcut | With shortcut | Reads with shortcut | Unique synced rows |
|---|---:|---:|---:|---:|
| Food memberships | 259 ms | 173 ms | 5,401 | 911 |
| Food students | 505 ms | 491 ms | 9,011 | 6,011 |
| Students directory | 328 ms | 329 ms | 12,000 | 7,511 |
| Entries | 1,329 ms | 1,308 ms | 39,000 | 9,103 |
| Available divisions | 19 ms | 19 ms | 393 | 93 |

Only Food memberships changed between the compared application versions: its reads fell from 9,902 to 5,401 with identical synced-row counts. Other timing differences are run variability. These are synthetic local results, not production latency predictions.

Inspect every sample's plan before identifying a persistent bottleneck. The Students directory's first entry-member sample scanned about 4.5 million rows, but the next two used the existing Student index and scanned 6,000 rows. Guardian-Center plans also changed between samples. Food's assignment relationship consistently used an Edition index rather than a membership-leading lookup (about 180,300 visits). Validate candidate index/query changes against repeated plans and permission regressions. Some Zero 1.9 analyzer scan counters are negative; retain them in raw diagnostics but do not interpret them as meaningful negative work.


The test-only assignment index experiment used `(membership_id, edition_id, id)` on the same fixture. Assignment scans fell from 180,300 to 600 in all three samples; Food membership median analyzer time fell from 173 ms to 148 ms with 911 unique synced rows. A separate offline replica experiment confirmed `ANALYZE` alone did not produce a membership-leading lookup. Migration 0084 adds this index to the application schema. Other plan choices changed during sampling, including Guardian-Center predicate pushdown, so total read counts varied even with identical synced results.

## App data-scale benchmark

`tests/performance/app.spec.ts` profiles the Dashboard, Events, reimbursements, vendor payments and vendors using a separate synthetic fixture. Enable it with `APP_PERFORMANCE=true` and run it through the same isolated harness:

```bash
env -u ELECTRON_RUN_AS_NODE APP_PERFORMANCE=true E2E_STACK_INDEX=2 \
  PLAYWRIGHT_HTML_OPEN=never bash packages/e2e/run-e2e.sh \
  tests/performance/app.spec.ts --project=super_admin --workers=1 --retries=0
```

The fixture creates 600 Events with memberships and interests, 1,000 reimbursements, 500 advances, 100 Vendors and 1,000 Vendor Payments. Each financial request has two line items and two history rows; each Vendor Payment also has a transaction with two history rows. The helper refuses databases outside the local test stack and checks repeatable counts on a second seed. The report attachment `app-performance.json` contains per-route query diagnostics. Its `navigationAndAnalysisMs` includes three analyzer calls per query and must not be reported as page-load time. Server hydration, total hydration and analyzer samples remain separate fields. Shared diagnostic capture lives in `helpers/zero-performance.ts`.

Initial Dashboard samples on this fixture (2026-09-14, three analyzer calls per query):

| Query | Median analyzer time | Reads | Unique synced rows |
|---|---:|---:|---:|
| reimbursement.all | 324 ms | 9,014 | 5,615 |
| advancePayment.all | 142 ms | 4,000 | 2,505 |
| vendorPayment.all | 480 ms | 14,011 | 8,712 |
| teamEvent.allAccessible | 156 ms | 3,666 | 1,845 |
| teamEvent.byCurrentUserAll | 159 ms | 4,272 | 1,837 |

Steady-state financial relationship plans use the existing foreign-key indexes. A full root scan is expected for these unbounded admin queries; it is not by itself evidence of a missing index. Small attachment tables can also be cheaper to scan than index. These measurements do not justify narrowing the existing local datasets. This fixture does not yet model attachment-heavy requests, recurring Event exceptions, deep detail histories, or restricted financial roles.
