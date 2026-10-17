# E2E Testing

> **Load when**: `packages/e2e`, Playwright tests, `global-setup`, seed helpers, test fixtures, `.auth` state, shard-by-duration, `run-e2e.sh`, E2E DB isolation, `duration-reporter`, flaky tests, test-user seeding, performance benchmarks.
> **Related**: `data-layer.md`, `env-and-secrets.md`, `monorepo.md`, [query performance audit](../query-performance-audit.md). Writing conventions (selectors, fixtures, when to add a spec) are in `.agents/skills/e2e-testing/SKILL.md`.

## Layout

```
packages/e2e/
├── .auth/                  # storageState per shared role and active Kalakriti actor
├── fixtures/               # test.ts shared fixture, Kalakriti actors, upload files
├── helpers/                # Seeds, feature helpers, performance profilers
├── pages/                  # Page objects
├── tests/                  # Specs by feature folder
├── global-setup.ts         # Signs in shared roles and active Kalakriti actors
├── playwright.config.ts
├── project-selection.ts    # Role-only and release-invariant spec filters
├── duration-reporter.ts    # Writes .test-durations.json
├── shard-by-duration.ts    # CI shard lists
├── run-e2e.sh              # Full-stack orchestration
├── run-two-stacks.ts       # Opt-in two-stack run
├── partition-specs.ts      # Whole-file balancing for two stacks
├── stack-workspace.ts      # Source snapshots for two stacks
├── .env.test               # E2E-only env and test credentials
└── .test-durations.json    # Historical timings for sharding
```

## Commands

| Command | What it does |
|---|---|
| `bun run test:e2e` | Full suite through Turborepo (`bash run-e2e.sh`) |
| `cd packages/e2e && bash run-e2e.sh` | Full suite: isolated DB, migrate, seed, Zero, app, Playwright, teardown |
| `cd packages/e2e && bash run-e2e.sh tests/<spec>.spec.ts` | One spec; paths are relative to `packages/e2e/`. Extra arguments go to `playwright test` |
| `E2E_SERVER=dev bash packages/e2e/run-e2e.sh tests/<spec>.spec.ts` | Run against Vite dev, skipping the production build |
| `bash run-e2e.sh --ui` or `bun run test:e2e:ui` | Playwright UI mode on the same harness; defaults to Vite dev so app edits show |
| `bash packages/e2e/run-e2e.sh --list` | List selected tests without starting services (`--help` also returns early) |
| `bun run packages/e2e/run-two-stacks.ts` | Whole suite across two isolated stacks (see below) |
| `bun run test:seed` | Run `helpers/seed-test-user.ts` against `DATABASE_URL` |
| `bun run --cwd packages/e2e test:unit` | Partition, snapshot, books-serial-group and process-cleanup tests (also part of `bun run test:unit`) |

`E2E_SERVER` accepts `production` (default) or `dev`. `--ui` and `--debug` switch the default to `dev` unless `E2E_SERVER` is set. Local runs use at most four workers; pass `--workers` to override.

## Browser projects

`playwright.config.ts` defines `setup`, its teardown `exclusive_last` and seven browser projects, all Desktop Chrome:

| Project | Storage state | Notes |
|---|---|---|
| `setup` | none | Runs `global-setup.ts` once per invocation |
| `kalakriti_release_invariants` | `unoriented_volunteer` | One worker. Specs listed in `project-selection.ts` |
| `super_admin` | `super_admin` | |
| `admin` | `admin` | Ignores `users/` |
| `finance_admin` | `finance_admin` | Ignores `users/` |
| `volunteer` | `volunteer` | Ignores `users/` |
| `unoriented_volunteer` | `unoriented_volunteer` | Also ignores `reimbursements/` and `teams/`; dedicated coverage in `tests/roles/unoriented-volunteer-flows.spec.ts` and `tests/authorization/` |
| `unauthenticated` | none | Only `tests/auth/`; depends on `setup` so the teardown waits for it |
| `exclusive_last` | `super_admin` | One worker, after every other project. Specs listed in `project-selection.ts` |

Every authenticated project ignores `tests/auth/`, so API authorization specs belong in `tests/authorization/`.

`project-selection.ts` keeps a role-only file out of the other role projects. Add a file to a role's list only when every test in it is gated to that role. Release-invariant specs are excluded from all role projects.

## Specs that run last, alone

Some state reaches every spec on the stack: a second active cost centre makes every event and request form ask for a city. Such specs go in `exclusiveLastSpecs` (`project-selection.ts`) and run in `exclusive_last`, the teardown of `setup`, which Playwright starts once every project depending on `setup` has finished. Role projects ignore these files. It has no dependencies, so a failure elsewhere doesn't skip it, but `unauthenticated` is now skipped when setup fails. A teardown doesn't pull in setup, so `run-e2e.sh` adds `global-setup.ts` whenever spec files are named. `shard-by-duration.ts` leaves `[exclusive_last]` rows out, as it does `[setup]`, since the teardown runs in every shard. Other cost centre specs add their centres inactive and run in parallel; seeding deactivates any `E2E…` centre a stopped run left active.

## Global setup and auth

`global-setup.ts` loads `.env.test`, signs in each shared role and each active Kalakriti actor through Playwright's API `request` fixture, and saves `request.storageState()` under `.auth/`. Dormant actors get no state file. Each actor sends a distinct `192.0.2.x` `x-forwarded-for` address, so setup does not use up the localhost rate-limit bucket that browser login tests share. `authenticate()` logs each response and retries only a 429, a bounded number of times.

The shared fixture in `fixtures/test.ts` listens for browser errors only when a test requests `page`. API-only authorization tests use `request`, so they exercise the live HTTP and Zero authorization path without a browser page.

Fixture users are inserted by `seed-test-user.ts`, bypassing Better Auth sign-up and its email verification and 18+ date-of-birth checks. Public self-registration is covered by `tests/auth/register.spec.ts`.

## Seeding and DB isolation

`run-e2e.sh` migrates the test database, then runs `helpers/seed-test-user.ts`. That seed creates the canonical global users and calls `helpers/kalakriti-release-fixture.ts` for the Registration Release roles and the cross-Edition, cross-Center, privacy and race fixtures. Feature helpers in `helpers/` add the entities a spec needs and should be idempotent (`onConflictDoNothing()`), returning inserted IDs.

`helpers/seed-dev-data.ts` seeds development data for `scripts/cloud-session-start.sh`; the harness does not run it.

`run-e2e.sh` writes a temporary `packages/db/docker-compose.e2e<suffix>.yml` and starts its own Postgres (`pi-dash-test` on loopback). Ports derive from `WORKTREE_ID`, so runs never touch the dev database. Teardown removes it.

## `run-e2e.sh`

1. Starts the isolated Postgres, migrates and seeds it.
2. Starts Zero in production mode with `ZERO_LAZY_STARTUP=false` and a test-only `ZERO_ADMIN_PASSWORD` (default `e2e-test-admin`), then waits for the root HTTP health response. Inspector-based tests authenticate with that env value; they must not rely on the interactive prompt or the development-mode bypass.
3. Builds the Nitro output with `NODE_ENV=production`, overlapping the build with Zero startup, and serves it with `NODE_ENV=test`. This keeps localhost WebSocket behaviour and does not verify deployment CSP.
4. Exports `VITE_E2E=true`. With `NODE_ENV=test` this raises in-memory API rate budgets 100 times for shared E2E users.
5. Runs `playwright test`, prints environment-ready, Playwright and total elapsed times, and tears everything down on exit.

`E2E_STACK_INDEX=1|2` gives a run its own ports (`20000 + worktreeId * 100 + stackIndex * 10`: web, Zero, change streamer, Postgres) and suffixes container, Compose, volume, replica and log names. Benchmarks use `E2E_STACK_INDEX=2` so they can run beside an ordinary stack.

## Release-invariant lane

Specs that touch the database-wide single-live-Edition constraint run only in `kalakriti_release_invariants` with one worker. Distinct fixture IDs do not isolate them. The project is queued before the role projects so its serial work overlaps theirs.

- Put new live-Edition specs in this lane and add them to `releaseInvariantSpecs` in `project-selection.ts`.
- `operations-person-qr.spec.ts` and `event-day-transport.spec.ts` override the lane's storage state with the super-admin actor and test other actors in separate browser contexts.
- `event-day-transport.spec.ts` uses isolated Edition 2166 and its own Guardian. `event-day-stations.spec.ts` uses live Edition 2168 and draft Edition 2169.
- Camera frames are simulated at the decoder boundary; everything else uses the real stack.
- Cleanup removes Center scan stages before Centers because their composite foreign key is restrictive.
- Transport fixtures must finalize pickup and venue arrival before testing departure.

## CI sharding

`.github/workflows/ci.yml` splits E2E across four shards by duration:

1. The `prepare-shards` job runs `shard-by-duration.ts 4`.
2. It reads `.test-durations.json`, restored by `actions/cache` with key `e2e-durations-${{ github.ref_name }}` and fallback `e2e-durations-master`.
3. Longest-first greedy bin-packing assigns project-qualified test cases to `shard-lists/shard-{1..4}.txt`. Unknown tests count as 10 s.
4. Each shard job runs Playwright with `--test-list`.

`duration-reporter.ts` records passed and runtime-skipped case durations; CI merges the shard files and saves them back to the cache.

## Two-stack run

`run-two-stacks.ts` is an opt-in way to run the whole suite on two independent local stacks; the normal runner stays single-stack. Each child uses two workers, `--trace=off` and `--retries=0`.

- The coordinator snapshots tracked and non-ignored working files, so uncommitted changes are included.
- Workspace dependencies point into the snapshot; external packages link to the existing install. Never link writable `.nitro`, `.vite`, `.vite-temp` or `.cache` between snapshots: a shared Nitro directory mixes asset manifests from concurrent builds and serves missing chunks.
- `partition-specs.ts` keeps every project's cases for a spec file on one stack, preserving serial and `beforeAll` dependencies, and balances files by historical worker time. The coordinator checks every selected case is covered exactly once.
- The coordinator prints a temp directory with per-stack logs, partition data and `summary.json`.

### Books serial group

Closing FY 2026-27 or matching its audited figures freezes that year for every spec on the same database. So every test that posts into the books and waits on the result (the `postings` helper step, Books → Post pending), closes the year (`close-year*`) or matches audited figures (`post-audited`, `reverse-audited`) lives in the serial "Books (treasurer)" group of `tests/finance/books.spec.ts`. That includes voiding a posted reimbursement and payment proof. The partition keeps the file on one stack, and `books-serial-group.test.ts` fails when another spec uses those steps.

## Page objects

`pages/` holds page-object classes. A new page object exports a class with `goto()` and action methods; keep selectors out of specs.

## Performance benchmarks

Benchmarks are opt-in specs under `tests/performance/`, skipped unless their flag is set. All of them run as `super_admin` on an isolated stack:

```bash
env -u ELECTRON_RUN_AS_NODE <FLAG>=true E2E_STACK_INDEX=2 PLAYWRIGHT_HTML_OPEN=never \
  bash packages/e2e/run-e2e.sh tests/performance/<spec>.spec.ts \
  --project=super_admin --workers=1 --retries=0
```

| Benchmark | Spec and helpers | Flag | What it guards |
|---|---|---|---|
| Kalakriti data scale | `kalakriti.spec.ts`; `helpers/seed-kalakriti-performance.ts`, `zero-performance.ts` | `KALAKRITI_PERFORMANCE` | Zero hydration of every Kalakriti page on 10 Centers, 1,500 Students and 3,000 Entries |
| Kalakriti restricted roles | `kalakriti.spec.ts` | `KALAKRITI_PERFORMANCE` | The same pages as Guardian, liaison, Edition admin, volunteer coordinator, category lead and overall-events lead; exact root IDs and no outside-Center rows |
| Center transport and Scan | `kalakriti.spec.ts`; `pages/kalakriti-scan-page.ts` | `KALAKRITI_PERFORMANCE` | Center detail transport (four records per Center) and Transport scanning hydration for admin, Guardian and liaison. No live scan recording or camera |
| Guests and Judges | `kalakriti.spec.ts` | `KALAKRITI_PERFORMANCE` | `kalakritiAttendee.visible` per `kind`, 100 roots each, with operations and Judge assignments |
| Group Entries | `kalakriti.spec.ts` | `KALAKRITI_GROUP_PERFORMANCE` (with `KALAKRITI_PERFORMANCE`) | 300 ten-student group Entries instead of 3,000 individual ones; synced member counts per role |
| Dashboard aggregates | `helpers/profile-kalakriti-dashboard.ts` (run by `kalakriti.spec.ts`) | `KALAKRITI_PERFORMANCE` | PostgreSQL aggregate time for Edition, two-Center, two-Competition and all-category scopes; Student and Entry totals |
| App data scale | `app.spec.ts`; `helpers/seed-app-performance.ts`, `zero-performance.ts` | `APP_PERFORMANCE` | Dashboard, Events, requests, vendors, Users, notifications, banking, Scheduled Messages, Teams and settings as admin and volunteer; denied details sync zero rows |
| Event detail | `app.spec.ts` | `APP_PERFORMANCE` | 200 updates, photos and feedback rows on one Event; volunteers mount no `eventFeedback.byEvent` query |
| Event expenses | `app.spec.ts` | `APP_PERFORMANCE` | 200 reimbursements and 200 vendor payments on one Event; 200/100 roots and volunteer ownership |
| Team-lead queue | `app.spec.ts` | `APP_PERFORMANCE` | 801 pending interests on one private Event; denied Team registers no `teamEvent.byTeam` query |
| Global Audit Log | `audit.spec.ts`; `helpers/profile-audit-performance.ts`, `postgres-performance.ts` | `AUDIT_PERFORMANCE` | 50,000 rows; nine filter, search and pagination cases with exact IDs; volunteer 403; ordered index used without temp writes; grouped facets match; one debounced search request |
| Kalakriti Audit | `kalakriti-audit.spec.ts`; `helpers/profile-kalakriti-audit.ts`, `postgres-performance.ts` | `KALAKRITI_AUDIT_PERFORMANCE` | 41,000 rows across two Editions; exact results for three roles, domain filters, deep offsets, snapshot reuse and denied domains |

Each Zero query gets three analyzer samples after initial hydration. JSON reports are attached to the Playwright report and hold counts, timings and sanitized plans only, never record contents, filter values or credentials. No timing threshold is enforced.

### Index experiment flags

These add a disposable index in the test database only and record the flag in the report. Leave them off when validating real migrations.

| Flag | Benchmark | Index | Status |
|---|---|---|---|
| `ENTRY_MEMBER_INDEX_EXPERIMENT` | Kalakriti | entry member `(student_id, edition_id, id)` | Shipped in migration 0089 |
| `CATEGORY_ASSIGNMENT_INDEX_EXPERIMENT` | Kalakriti | assignment `(competition_category_id, responsibility, id)` | Shipped in 0090 |
| `OPERATION_INDEX_EXPERIMENT` | Kalakriti | operation `(student_id, edition_id, type, id)` | Shipped in 0091 |
| `ENTRY_ORDERING_INDEX_EXPERIMENT` | Kalakriti | Entries `(edition_id, created_at DESC, id)` and members `(entry_id, edition_id, id)` | First shipped in 0092; member index still experimental |
| `NOTIFICATION_INDEX_EXPERIMENT` | App | notification `(user_id, archived, created_at DESC, id)` | Shipped in 0088 |
| `SCHEDULED_INDEX_EXPERIMENT` | App | scheduled message and recipient ordering | Rejected |

### Benchmark rules

- Seeds refuse any database that is not loopback `pi-dash-test`, use repeatable IDs and are idempotent within one mode. Use a fresh database when switching `KALAKRITI_GROUP_PERFORMANCE` on or off.
- Compare before and after on the same seed, role, runtime and machine. `--ui` runs on Vite dev, so do not compare its timings with production-build runs.
- Keep analyzer time, server hydration (`serverMs`), total hydration (`totalMs`) and navigation time separate. Do not subtract them to infer network latency. `navigationAndAnalysisMs` includes the analyzer calls and is not page-load time.
- Inspect every sample's plan; SQLite plans can change between samples. Some Zero 1.9 analyzer scan counters are negative: keep them in raw diagnostics and ignore them.
- Inspector `rowCount` includes related rows (reported as `inspectorRows`). Root counts come from a separate untimed verification pass.
- Zero caches views by AST, so two query names with the same AST (for example admin `availableDivisionsByCenter` and `availableDivisions`) show up as one view.
- Record results, accepted changes and rejected hypotheses in the [query performance audit](../query-performance-audit.md).
