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

The isolated stack runs `helpers/seed-kalakriti-performance.ts` and profiles Food memberships/students, the Students directory/compliance query, Entries/divisions, Guardians, Volunteers, Centers and Competition configuration as the seeded super-admin. Each query is analyzed three times after initial hydration. The Playwright report includes `kalakriti-performance.json` with dataset counts, server/total hydration timings, analyzer timings, read/scan counts and SQLite plans; it omits record contents and credentials. No timing threshold is enforced because local hardware and concurrent work vary.

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

Steady-state financial relationship plans use the existing foreign-key indexes. A full root scan is expected for these unbounded admin queries; it is not by itself evidence of a missing index. Small attachment tables can also be cheaper to scan than index. These measurements do not justify narrowing the existing local datasets. The initial table above predates the split of fixture ownership between admin and volunteer. Current fixtures alternate financial ownership, preserving the same total root counts. The benchmark also profiles the volunteer’s lists, public Event access, own financial details and denied financial details; denied detail queries must sync zero rows. This fixture does not yet model attachment-heavy requests, recurring Event exceptions or deep detail histories.


Restricted-role baseline (same total fixture scale, 2026-09-14):

| Query | Median analyzer time | Reads | Unique synced rows |
|---|---:|---:|---:|
| reimbursement.all (500 owned) | 167 ms | 4,500 | 2,803 |
| advancePayment.all (250 owned) | 78 ms | 2,000 | 1,253 |
| vendorPayment.all (500 owned) | 236 ms | 7,000 | 4,353 |
| teamEvent.allAccessible (300 public fixture Events) | 85 ms | 2,200 | 946 |
| reimbursement.byId (owned) | 13 ms | 9 | 9 |
| vendorPayment.byId (owned) | 14 ms | 14 | 13 |
| reimbursement.byId / vendorPayment.byId (denied) | 11 ms each | 0 | 0 |

These steady-state samples use indexed relationship lookups. The analyzer helper matches query arguments as well as names, preventing a cached detail query for a different record from satisfying a scenario.


Additional Kalakriti admin baselines (same large fixture, 2026-09-14): Guardians 14 ms for 150 memberships; Volunteers 32 ms for 150 memberships plus 600 assignments; Centers 13 ms for 10 rows; Student compliance 126 ms for 1,500 Students plus 3,000 entry members; Competition configuration queries 12–14 ms for 30 Competitions/sessions. These do not show the persistent membership-assignment scan fixed in migration 0084. Most roster users are unlinked synthetic memberships; the fixture now links one Guardian and one liaison for restricted Students, Entries and Food measurements. Other roster roles remain unmeasured. The fixture's single category and venue are functional coverage, not scale evidence for those tables.


The Kalakriti benchmark also runs `helpers/profile-kalakriti-dashboard.ts` after the guarded seed. This invokes the production PostgreSQL projection implementation for edition, two-Center, two-Competition and all-category scopes, three times each. Only elapsed times and aggregate totals are reported. It verifies the edition's Student/Entry totals and renders the overview page. This measures aggregate execution separately from authentication, scope resolution, HTTP latency and Zero hydration; manually supplied scopes are not authorization tests.

On the 1,500-Student/3,000-Entry fixture, median aggregate execution was 112 ms edition-wide, 40 ms for two Centers, 19 ms for two Competitions and 113 ms across all Competition Categories. These results do not establish a server aggregate bottleneck on local hardware.

Zero analysis now requests join plans and records only plan structure and cost estimates, omitting filter/constraint values. This complements SQLite index plans when investigating repeated relationship work. The [Zero inspector documentation](https://zero.rocicorp.dev/docs/debug/inspector) explains the two planner layers. `serverMs` and `totalMs` come from server and client query metrics respectively; they are retained separately and must not be subtracted to infer network latency when cached queries or client recreation can refer to different hydration lifetimes.

With join diagnostics enabled, the admin Entries query still reads 39,000 rows for 9,103 unique synced rows (about 4.3 reads per synced row). It returns no alternative join-plan events, while Food and available-divisions queries do. Its admin permission shortcut is already present. The current measurements therefore do not justify another permission shortcut or a speculative index for Entries; its full relationship graph remains the largest measured hydration workload.


## Restricted Kalakriti scale profiles

The benchmark uses an active Guardian membership for the seeded unassigned volunteer account and the seeded liaison account's membership. Both have access to Centers 0 and 1. This avoids altering the existing Guardian's globally unique active membership in the release fixture. It changes no global permissions or existing release memberships.

Each scoped query has three timed analyzer samples plus a separate scope-verification analysis. The latter counts the specific table's synced records and checks Student/Entry Center IDs, returning only counts. Inspector `rowCount` includes related records and is recorded as `inspectorRows`; it must not be treated as the root table's count. Record contents from the verification pass never enter the report.

Baseline before testing additional Center/Competition assignment indexes:

| Query | Guardian median | Liaison median | Verified root rows |
|---|---:|---:|---:|
| Students directory | 110 ms | 119 ms | 300 |
| Entries | 391 ms | 397 ms | 600 |
| Food students | 113 ms | 114 ms | 300 |
| Food memberships | 151 ms | 162 ms | 90 |

All Student and Entry rows belong to the two assigned Centers. Food membership analysis reads approximately 6,900 rows for 213 unique synced rows. Its Center assignment lookups and Entries' Competition assignment lookups use broad scans with the current indexes; these are candidates for measured index experiments.

A disposable-database experiment added assignment indexes on `(center_id, responsibility, edition_id, id)` and `(competition_id, responsibility, id)`. Guardian Entries assignment scans fell from 24,846 to 906; Food membership assignment scans fell from 20,072 to 1,864. Timings did not materially improve (Entries 391 → 388 ms, Food memberships 151 → 149 ms), and read/synced counts were unchanged. Liaison samples were similarly unchanged. Migration 0085 includes these indexes to reduce scan work as assignment volume and concurrency grow. This is a scan-work improvement; faster page loads have not been demonstrated by this local comparison. The remaining read amplification requires investigating the permission/relationship graph, rather than assuming every scan reduction yields a useful latency reduction.


## Center transport and Scan profiles

The large Kalakriti fixture includes 40 synthetic transport assignments, four per Center. The benchmark navigates the real Center detail route for admin, Guardian and liaison accounts and verifies exactly four transport records, all from the selected Center. It then uses the Scan page object to open Transport scanning for admin and liaison accounts and select Performance Center 1. The fixture remains in registration-open state: this measures query hydration, not live scan recording or camera performance.

Local baseline (2026-09-14, median of three analyzer calls):

| Query / account | Median analyzer time | Reads | Unique synced rows |
|---|---:|---:|---:|
| Transport / admin | 10 ms | 4 | 4 |
| Transport / Guardian | 14 ms | 16 | 7 |
| Transport / liaison | 15 ms | 20 | 7 |
| Center Scan / admin | 25 ms | 454 | 452 |
| Center Scan / liaison | 26 ms | 458 | 454 |

Transport uses its existing Edition/Center index. Center Scan returns one Center with 150 Students and 300 pickup/venue-arrival operations; its root count is verified separately. These samples do not establish a query bottleneck or justify another index. Persisted scan-stage rows, later finalized stages, live mutation latency and larger per-Center rosters remain unmeasured. Server hydration and total hydration remain separate fields in the report attachment.


## Guest and Judge profiles

The Kalakriti fixture adds 100 Guests, 100 Judges, two Competition assignments per Judge and three operations per attendee (check-in, breakfast and lunch). Its existing 6,000 Student operations remain unchanged; total operations are 6,600. The benchmark opens both real roster routes as admin, matches analyzer queries by Edition and kind, and verifies 100 attendee root rows per roster. Reports include `kind` to distinguish the two instances of `kalakritiAttendee.visible`.

Initial median analyzer times were 22 ms for Guests (400 reads / 400 synced rows) and 34 ms for Judges (800 reads / 630 synced rows). These populated admin profiles do not show a slow hydration. Restricted Judge assignment visibility still needs a separate workload.

See [query performance audit coverage](../query-performance-audit.md) for the complete registered query inventory and remaining scope; a benchmark for one account or query variant does not prove the whole page or permission surface.


## Entries member Center relation comparison

On the same expanded fixture, removing the unused `members.student.center` relation reduced admin Entries reads from 39,000 to 36,000, with 9,103 unique synced rows unchanged. Median analyzer time decreased from 1,332 ms to 1,202 ms (three samples per version, approximately 10%). This is an analyzer comparison, not a production page-load measurement. The query still includes the Entry's Center, member Student age category and arrival/attendance operations, music files and Division context. Registration picker Center labels come from `kalakritiStudent.visibleForEntries`, which is unchanged.

Guardian Entries decreased from 390 ms to 363 ms and liaison Entries from 385 ms to 364 ms. Each retained exactly 600 Entry roots from the two assigned Centers and 1,898 unique synced rows; reads decreased from 14,545 to 13,945. The local regression run passed 25 checks (four role-inapplicable cases skipped), including registration, music editing and two-Center permissions.


## Populated Event detail profiles

The app fixture's first public Event is in the past with feedback enabled and both admin and volunteer membership (601 total fixture Event memberships). It contains 200 updates, 200 photo metadata rows and 200 feedback rows. Updates and feedback use valid Plate JSON. Updates/photos each have 100 approved and 100 pending rows, with pending content split equally between admin and volunteer authors. Photo rows have no remote asset keys and use the empty-image fallback: this does not measure media downloads or image decoding.

The benchmark verifies 100 approved rows, 100 admin-visible pending rows, 50 volunteer-owned pending rows and 200 admin feedback rows. It opens Photos and Feedback and asserts rendered update/feedback content. The volunteer feedback form must render without any `eventFeedback.byEvent` inspector query. Previously that aggregate query read 202 rows to return zero on this fixture; Event detail now enables it only for feedback managers. The existing participant server function and query authorization remain unchanged.

Local medians (2026-09-14, three analyzer samples):

| Query | Admin | Volunteer | Reads / synced, admin | Reads / synced, volunteer |
|---|---:|---:|---:|---:|
| Event by ID | 11 ms | Not profiled | 8 / 7 | Not profiled |
| Approved updates | 21 ms | 25 ms | 301 / 102 | 503 / 103 |
| Pending updates | 16 ms | 15 ms (own) | 200 / 102 | 253 / 53 |
| Approved photos | 21 ms | 25 ms | 301 / 102 | 503 / 103 |
| Pending photos | 17 ms | 14 ms (own) | 200 / 102 | 253 / 53 |
| Aggregate feedback | 14 ms | Subscription absent | 200 / 200 | No query |

These queries do not show a local hydration bottleneck at this scale. Rich-text rendering is exercised but not separately timed. The participant's own-feedback HTTP latency, external media, recurrence exceptions, deep expenses and lead-specific authorization still need separate measurements. The corrected benchmark passes all 13 checks, including authentication setup; root and focused TypeScript, unit, lint and unused-export checks pass. React Doctor retains branch-wide route/component diagnostics.


## Dashboard review profiles

With the expanded Event fixture, admin Dashboard medians were 13 ms for `team.byCurrentUser` (22 reads / 13 synced), 52 ms for `eventInterest.allPending` (1,803 / 1,204), and 20–21 ms for pending update/photo queries (approximately 300 reads / 100 synced). Team cardinality is small here, so this does not establish its scaling behavior.

`eventInterest.byCurrentUser` initially took 84 ms with 2,400 reads / 1,200 synced rows. Its existing user index was used, but a redundant Event-existence predicate caused repeated Event lookups for globally authorized readers. Removing that predicate only for `events.view_all` reduced the median to 42 ms and reads to 1,200, with exactly 600 owned interests and the same synced rows. Restricted Event access and ownership filters are unchanged. These are local analyzer timings, not production navigation measurements. The comparison/regression run passed 15 checks; ten existing cases skipped and are not completion evidence. Focused and full unit/type/lint/unused checks passed.


## Audit Log performance benchmark

Run `env -u ELECTRON_RUN_AS_NODE AUDIT_PERFORMANCE=true E2E_STACK_INDEX=2 PLAYWRIGHT_HTML_OPEN=never bash packages/e2e/run-e2e.sh tests/performance/audit.spec.ts --project=super_admin --workers=1 --retries=0`.

The helper refuses any database except loopback `pi-dash-test` before importing the database client. It seeds 50,000 synthetic audit rows, analyzes table statistics and profiles production query builders with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. The spec repeats the helper to check idempotent counts, measures authenticated HTTP reads for nine filter/pagination cases, and checks volunteer denial. `audit-performance.json` is attached to the Playwright report with sanitized plans and separate SQL/HTTP timings. The baseline and its limits are in `docs/query-performance-audit.md`; this is opt-in and does not seed production or the regular development database.

The Audit Log report also measures the original two distinct facet queries alongside the grouped implementation and asserts exact equality with the production loader's option arrays. These reference queries run only in the opt-in benchmark.

The Audit Log benchmark requires migration 0086's `(attempted_at DESC, id DESC)` index and verifies it exists before profiling. The helper also verifies exact expected row IDs and order for every scenario. The initial unindexed baseline is recorded in `docs/query-performance-audit.md`.

Audit search coverage includes a selective match, a broad match, no matches and an offset beyond the last match. The benchmark keeps exact totals when a page is empty and bounds expected page lengths at zero.

The Audit Log performance spec also navigates to page two in the browser and types a search. It requires exactly one API request with the final text and offset zero, preventing an immediate page reset from fetching the previous search before the 300 ms debounce completes.

The scoped Kalakriti Audit benchmark runs with `KALAKRITI_AUDIT_PERFORMANCE=true E2E_STACK_INDEX=2 bash packages/e2e/run-e2e.sh tests/performance/kalakriti-audit.spec.ts --project=super_admin --workers=1 --retries=0`. It seeds 41,000 local-only rows across two Editions and checks exact results for three roles, domain filters, deep offsets, snapshot reuse and denied domains. Its `kalakriti-audit-performance.json` attachment separates PostgreSQL plans from authenticated HTTP timings. Both audit benchmarks share the sanitized plan summarizer in `helpers/postgres-performance.ts`.

The app performance fixture also includes 10,000 synthetic notifications across admin and volunteer accounts, with equal archived/active histories. The benchmark verifies the exact newest-50 result set for each user, reporting only a boolean match plus diagnostics. Synthetic timestamps in 2191 ensure ordinary seed notifications cannot displace those expected IDs.

For the disposable notification index comparison, add `NOTIFICATION_INDEX_EXPERIMENT=true` to the app benchmark command. The guarded seed creates the candidate index only in the local test database and records the flag in the report. Default runs retain the migrated schema.


The app performance fixture also adds 1,000 synthetic users without credentials and 11,022 notification preferences using the canonical topic list. The benchmark visits Users, an individual user's notification settings, and personal settings for admin and volunteer. It verifies visible user totals and exact preference ownership without recording preference contents. These cases use the existing app performance command and local-only database guard.


The app performance fixture includes 500 completed Scheduled Messages and 5,000 sent recipient rows. It writes rows directly under the existing local database guard and enqueues no jobs. The benchmark checks root/recipient counts and measures the WhatsApp user picker by opening and cancelling the scheduling dialog. It does not submit a message or exercise delivery.


Set `SCHEDULED_INDEX_EXPERIMENT=true` with the app benchmark to compare disposable message and recipient ordering indexes. The seed records this option in the report; the isolated stack removes the indexes on teardown. The first 500-message comparison removed temporary sorts and reduced scans without a meaningful analyzer-time improvement, so it did not produce a schema migration.


The app benchmark visits Advance Payment detail as admin, owner and a denied requester using the existing 500-advance fixture. It verifies the exact request ID, owner and related line-item/history counts, plus the empty Reimbursement lookup mounted by the shared request-detail route. It does not edit or submit financial records.


The app fixture concentrates 200 Reimbursements and 200 Vendor Payments on the sampled public Event, split between two owners. The benchmark profiles both Event expense queries as admin and volunteer and asserts 200/100 roots plus volunteer ownership. Event summary metrics also consume these queries when the manager-only Expenses tab is absent.


The app benchmark opens the Vendor Payment form as admin and volunteer. It seeds 100 approved vendors and 50 pending vendors per account, derives the full approved count from the database, and verifies exact pending IDs for each account. Existing payments reference approved vendors. The form is not submitted.


Banking performance uses 2,004 synthetic accounts across fixture users. Personal Settings visits Notifications and Banking for both admin and volunteer, checks complete per-user counts against PostgreSQL and verifies every returned account belongs to the signed-in user. It performs no account changes or financial operations.
