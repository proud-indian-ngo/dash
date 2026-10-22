# E2E Testing

> **Load when**: `packages/e2e`, Playwright, `run-e2e.sh`, E2E seeding and DB isolation, sharding, flaky tests, performance benchmarks.
> **Related**: `env-and-secrets.md`, [query performance audit](../query-performance-audit.md). Writing conventions (selectors, fixtures, page objects, when to add a spec) are in `.agents/skills/e2e-testing/SKILL.md`.

## Commands

| Command | What it does |
|---|---|
| `cd packages/e2e && bash run-e2e.sh tests/<spec>.spec.ts` | One spec; paths are relative to `packages/e2e/`. Extra arguments go to `playwright test` |
| `E2E_SERVER=dev bash packages/e2e/run-e2e.sh tests/<spec>.spec.ts` | Run against Vite dev, skipping the production build |
| `bash run-e2e.sh --ui` | Playwright UI mode on the same harness; defaults to Vite dev so app edits show |
| `bash packages/e2e/run-e2e.sh --list` | List selected tests without starting services |
| `bun run packages/e2e/run-two-stacks.ts` | Whole suite across two isolated stacks (see below) |

## Projects

`playwright.config.ts` runs each spec once per role project. Every authenticated project ignores `tests/auth/`, so API authorization specs belong in `tests/authorization/`.

`project-selection.ts` keeps a role-only file out of the other role projects. Add a file to a role's list only when every test in it is gated to that role.

## Specs that run last, alone

Some state reaches every spec on the stack: a second active cost centre makes every event and request form ask for a city, a closed FY 2026-27 refuses statement imports and line actions dated in it, and a policy version in force sends everyone it is for to the accept page. The seed publishes no version, so no fixture user is held back. Such specs go in `exclusiveLastSpecs` (`project-selection.ts`) and run in `exclusive_last`, the teardown of `setup`, which Playwright starts once every project depending on `setup` has finished. It has no dependencies, so a failure elsewhere doesn't skip it. A teardown doesn't pull in setup, so `run-e2e.sh` adds `global-setup.ts` whenever spec files are named. Other cost centre specs add their centres inactive and run in parallel; seeding deactivates any `E2E…` centre a stopped run left active.

When filtering an exclusive-last spec with `--grep`, include `authenticate as|<test pattern>` so setup recreates logins for the fresh database. Naming the setup file does not exempt its tests from the filter.

## Global setup and auth

`global-setup.ts` signs in each shared role and each active Kalakriti actor through the API and saves storage state under `.auth/`. Each actor sends a distinct `192.0.2.x` `x-forwarded-for` address, so setup does not use up the localhost rate-limit bucket that browser login tests share.

The shared fixture in `fixtures/test.ts` listens for browser errors only when a test requests `page`. API-only authorization tests use `request`, so they exercise the live HTTP and Zero authorization path without a browser.

Fixture users are inserted by `helpers/seed-test-user.ts`, bypassing Better Auth sign-up, email verification and the 18+ date-of-birth check. Public self-registration is covered by `tests/auth/register.spec.ts`.

## Seeding and DB isolation

Feature helpers in `helpers/` add the entities a spec needs. They must be idempotent (`onConflictDoNothing()`) and return inserted IDs. `helpers/seed-dev-data.ts` seeds development data for cloud sessions; the harness does not run it.

`run-e2e.sh` starts its own Postgres (`pi-dash-test` on loopback) with ports derived from `WORKTREE_ID`, so runs never touch the dev database. It also builds and starts the signing service on a derived port, which issuing circulars, minutes and declarations need. CI doesn't start it: the specs that need it also need R2 and skip there.

## `run-e2e.sh`

- Zero runs in production mode with a test-only `ZERO_ADMIN_PASSWORD` (default `e2e-test-admin`). Inspector-based tests authenticate with that env value; they must not rely on the interactive prompt or the development-mode bypass.
- The production build is served with `NODE_ENV=test`. This keeps localhost WebSocket behaviour and does not verify deployment CSP.
- `VITE_E2E=true` with `NODE_ENV=test` raises in-memory API rate budgets 100 times for shared E2E users.

`E2E_STACK_INDEX=1|2` gives a run its own ports and container names. Benchmarks use `E2E_STACK_INDEX=2` so they can run beside an ordinary stack.

## Single-live-Edition lock

The database allows one live Edition, so distinct fixture IDs do not isolate specs that make an Edition live. Each declares `test.describe.configure({ lock: "single-live-edition" })`, and Playwright never runs two tests holding that lock at once, while everything else stays parallel. The lock only excludes its other holders: a spec that makes an Edition live, or depends on none being live, must take it too. These specs run once, in `unoriented_volunteer`, which is the first role project so their serial work is queued ahead of the rest.

- Add a new live-Edition spec to `singleLiveEditionSpecs` in `project-selection.ts` and declare the lock; `project-selection.test.ts` fails when the two disagree.
- `event-day-transport.spec.ts` uses isolated Edition 2166 and its own Guardian. `event-day-stations.spec.ts` uses live Edition 2168 and draft Edition 2169.
- Cleanup removes Center scan stages before Centers because their composite foreign key is restrictive.
- Transport fixtures must finalize pickup and venue arrival before testing departure.

## CI sharding

CI splits E2E across the shard count set by `E2E_SHARDS` in the `prepare-shards` job (eight) with `shard-by-duration.ts`, which bin-packs project-qualified cases by the timings in `.test-durations.json` (cached per branch, falling back to `master`). `duration-reporter.ts` records the timings and CI saves them back. Locally it adds to the existing file and drops entries for tests that moved, were renamed or no longer exist. Sharding leaves out `[setup]` rows, which run in every shard, and `[exclusive_last]` rows: those run only in shard 1, as the other shards set `E2E_SKIP_EXCLUSIVE_LAST=true`, and the planner books their time against shard 1 at twice its length, since they hold one of the two workers while the other idles.

Each shard runs `scripts/build-e2e.sh` in the background while Postgres, Playwright and zero-cache start, and waits for it before the tests. The script fixes every build input, sets `HERMETIC_ENV=1` so `@pi-dash/env` reads no `.env` file, and runs the `build:e2e` Turbo task through the remote cache only, since the cache server drops artifacts within hours and a local hit would not upload again. The lefthook pre-push hook runs the same script on a clean tree, so CI usually restores the build instead of making it. E2E builds (`VITE_E2E=true`) skip source maps.

## Two-stack run

`run-two-stacks.ts` is an opt-in way to run the whole suite on two independent local stacks; the normal runner stays single-stack.

- The coordinator snapshots tracked and non-ignored working files, so uncommitted changes are included.
- Never link writable `.nitro`, `.vite`, `.vite-temp` or `.cache` between snapshots: a shared Nitro directory mixes asset manifests from concurrent builds and serves missing chunks.
- `partition-specs.ts` keeps every project's cases for a spec file on one stack, preserving serial and `beforeAll` dependencies.

### Books serial group

Matching FY 2026-27's audited figures freezes that year for every spec on the same database. So every test that posts into the books and waits on the result (the `postings` helper step, Books → Post pending) or matches audited figures (`post-audited`, `reverse-audited`) lives in the serial "Books (treasurer)" group of `tests/finance/books.spec.ts`. That includes voiding a posted reimbursement and payment proof. The Budgets spec posts at once into FY 2027-28, which nothing freezes, and never changes the main bank account the books fixtures pay from, so it stays outside. Every test that closes the year (`close-year*`) lives in `tests/finance/books-year-close.spec.ts`, which runs last, alone. The partition keeps each file on one stack, and `books-serial-group.test.ts` fails when another spec uses those steps.

## Performance benchmarks

Benchmarks are opt-in specs under `tests/performance/`, skipped unless their flag is set. Use the `super_admin` project on an isolated stack. The login-transition benchmark signs in through the form as the seeded admin:

```bash
env -u ELECTRON_RUN_AS_NODE <FLAG>=true E2E_STACK_INDEX=2 PLAYWRIGHT_HTML_OPEN=never \
  bash packages/e2e/run-e2e.sh tests/performance/<spec>.spec.ts \
  --project=super_admin --workers=1 --retries=0
```

| Spec | Flag | What it guards |
|---|---|---|
| `kalakriti.spec.ts` | `KALAKRITI_PERFORMANCE` (add `KALAKRITI_GROUP_PERFORMANCE` for group Entries) | Zero hydration of every Kalakriti page on 10 Centers, 1,500 Students and 3,000 Entries, as admin and each restricted role, with no outside-Center rows; dashboard aggregate time in PostgreSQL |
| `app.spec.ts` | `APP_PERFORMANCE` | Main app pages as admin and volunteer at scale; denied details sync zero rows |
| `audit.spec.ts` | `AUDIT_PERFORMANCE` | Global Audit Log on 50,000 rows: exact filter and pagination results, ordered index used without temp writes |
| `kalakriti-audit.spec.ts` | `KALAKRITI_AUDIT_PERFORMANCE` | Kalakriti Audit on 41,000 rows across two Editions, per role |
| `login-transition.spec.ts` | `LOGIN_TRANSITION_PERFORMANCE` | Login submit to usable dashboard after fixed-speed credential entry; fresh contexts, cache enabled, no pre-login Zero connection |
| `navigation.spec.ts` | `NAVIGATION_PERFORMANCE` | Actual in-app link clicks on desktop and mobile as admin and volunteer; first and repeat visits with caches preserved |
| `lazy-features.spec.ts` | `LAZY_FEATURES_PERFORMANCE` | First and repeat opening of lazy Income and Books features on throttled mobile, measured from the captured click to real usable content |
| `claims-navigation.spec.ts` | `CLAIMS_NAVIGATION_PERFORMANCE` | Finance admin opening a claim and its charge editor by mobile tap, desktop click and deliberate hover; separate keyboard activation check |
| `claim-edit.spec.ts` | `CLAIM_EDIT_PERFORMANCE` | Claim detail, first/repeat main editor opening, and cold direct edit links; records readiness and downloaded JavaScript |
| `users-mount.spec.ts` | `USERS_MOUNT_PERFORMANCE` | First/repeat Users navigation plus a separate profiled repeat; preserves CPU throttling throughout |
| `kalakriti-layout.spec.ts` | `KALAKRITI_LAYOUT_PERFORMANCE` | Food layout shifts with empty and populated eligible rosters on mobile |
| `governance-navigation.spec.ts` | `GOVERNANCE_PERFORMANCE` | Cold governance pages, layout shifts and first form openings; route JavaScript is measured before forms open |
| `governance-warm-navigation.spec.ts` | `GOVERNANCE_WARM_PERFORMANCE` | First and repeat visits to nine governance pages from the dashboard, with caches preserved and populated-content readiness |
| `finance-navigation.spec.ts` | `FINANCE_NAVIGATION_PERFORMANCE` | First and repeat Income and Books navigation from the dashboard on desktop and mobile, with populated route-specific readiness |
| `web-vitals.spec.ts` | `WEB_VITALS_PERFORMANCE` | Cold login, dashboard, events and reimbursement-list loads on desktop and mobile; add `WEB_VITALS_RETURNING=true` for cached authenticated reloads or `WEB_VITALS_ASSERT=true` to enforce good thresholds |
| `route-startup.spec.ts` | `ROUTE_STARTUP_AUDIT` | Cold route screening from a `ROUTE_AUDIT_MANIFEST` JSON file; defaults to one mobile sample per route, with optional `ROUTE_AUDIT_RUNS`, `ROUTE_AUDIT_VIEWPORT` and `ROUTE_AUDIT_TRACE=true` |
| `rendering-memory.spec.ts` | `RENDERING_PERFORMANCE` | Eight desktop navigation cycles on scale fixtures: renderer CPU, sampled JS heap, post-GC retention, DOM/listeners and process RSS |

### Compare navigation runs

Compare matched production builds with the same seed, role, route sequence, throttling and machine. Stop concurrent builds, tests and profilers. Click-to-content includes readiness assertion overhead; it is separate from Event Timing latency. Three local samples are not real-user percentiles.

Navigation benchmarks use real links after dashboard readiness. First visits can reuse code and queries loaded by earlier pages; repeats preserve those caches. Keep the app's preloading and motion settings unchanged.

| Option | Use |
|---|---|
| `PERFORMANCE_LABEL` | Label claim-edit, Users-mount and Food-layout reports |
| `GOVERNANCE_PERFORMANCE_LABEL`, `GOVERNANCE_PERFORMANCE_ROUTES` | Label cold governance reports and optionally select comma-separated route names |
| `GOVERNANCE_WARM_LABEL`, `GOVERNANCE_WARM_ROUTES` | Label and select warm governance destinations |
| `NAVIGATION_IDLE_WAIT_MS` | Add a fixed quiet period before navigation; leave unset for immediate interaction |
| `FINANCE_NAVIGATION_IDLE_WAIT_MS` | Override the idle period for finance navigation |
| `GOVERNANCE_WARM_IDLE_WAIT_MS` | Add an idle window after the governance benchmark's two-second dashboard settle |

Use equal idle windows when comparing code warming. Reports include JavaScript downloaded before navigation, so a faster click does not hide the cost of warming.

Warm governance gives each destination a fresh context and keeps its first/repeat pair in one document. Meetings checks the populated Past tab count; Registrations checks the empty-state search control because the standard seed has no registration.

Add `GOVERNANCE_WARM_REGISTER_ACTIONS=true` to measure Add trustee, trustee details and the first Add term opening. Add and detail scenarios use independent fresh contexts, so one form's loaded code cannot mask another's first-use cost. Each scenario measures navigation before opening and cancelling dialogs.

### Cold loads and returning visits

Set `ROUTE_AUDIT_RETURNING=true` to measure a reload after a complete initial visit, preserving HTTP and Zero caches. Export first-use supports `EXPORT_SSR_RETURNING=true`; web vitals supports `WEB_VITALS_RETURNING=true`.

Route screening records redirects, fallbacks, page errors and timeouts separately. Inspect each sample: a passing harness does not mean every route reached its intended state. Generic readiness checks the heading, Zero connection and visible skeletons, not populated-data completeness. Router tracing is best effort and can miss work before the router becomes available.

Web vitals takes three fresh contexts per route and viewport at 4× CPU slowdown, 1.6 Mbps download and 150 ms latency. Cold mode disables HTTP caching; returning mode measures a cached reload. Reports include skeleton-free readiness, LCP, maximum CLS session window and the worst observed Event Timing duration. This interaction proxy is not field INP.

`WEB_VITALS_ASSERT=true` requires LCP ≤2.5 s, CLS ≤0.1 and interaction latency ≤200 ms. Production validation still needs real-user measurements.

### Profiles and query reports

Rendering-memory uses 1366×768 and 4× CPU slowdown without network throttling. Set `RENDERING_PERFORMANCE_LABEL` to retain matched reports under `tmp/rendering-performance/`. Compare the same Dashboard checkpoint after warm-up; initial route-code and query-cache growth is expected. CPU counters are main-thread time, not utilization. Heap sampling can miss peaks; process RSS includes native memory and can double-count shared pages when summed.

`RENDERING_PERFORMANCE_HEAP_SNAPSHOT=true` adds warm/final snapshots around a separate eight-cycle diagnostic pass after measurements and CPU profiling. Never use snapshot-inflated RSS as the app's memory requirement.

For the shared filter evaluator alone, run `bun scripts/performance/table-filters.ts before`, make the change, then run it with `after`. The script saves each browser bundle; `--bundle tmp/rendering-performance/filter/before.bundle.js` reruns the original under a new label. Seven timed samples and separate allocation profiles verify CPU/allocation changes independently of React and DOM rendering. Results and limitations live in the [rendering performance audit](../rendering-performance-audit.md).

Keep diagnostic profiling separate from latency comparisons:

- `NAVIGATION_PROFILE=true` records an extra Users navigation after the measured route sequence. Subsequent `filterMeasurements` time first/repeat quick-filter opening with profiling off. Open `.cpuprofile` attachments in Chrome DevTools.
- `LAZY_FEATURES_PROFILE=true` records contribution-dialog CPU profiles and timelines in separate normal/reduced-motion contexts. In-page marks separate control mounting, rendering frames and animation completion without readiness polling. These runs do not enter the latency report.

Query benchmarks take three analyzer samples after initial hydration, without timing thresholds. JSON attachments contain counts, timings and sanitized plans, never record contents, filter values or credentials.

### Index experiment flags

The `*_INDEX_EXPERIMENT` flags in the performance seeds add a disposable index in the test database only and record the flag in the report. Leave them off when validating real migrations. Shipped and rejected indexes are recorded in the [query performance audit](../query-performance-audit.md).

### Benchmark rules

- Seeds refuse any database that is not loopback `pi-dash-test`, use repeatable IDs and are idempotent within one mode. Use a fresh database when switching `KALAKRITI_GROUP_PERFORMANCE` on or off.
- Compare before and after on the same seed, role, runtime and machine. `--ui` runs on Vite dev, so do not compare its timings with production-build runs.
- Keep analyzer time, server hydration (`serverMs`), total hydration (`totalMs`) and navigation time separate. Do not subtract them to infer network latency. `navigationAndAnalysisMs` includes the analyzer calls and is not page-load time.
- Inspect every sample's plan; SQLite plans can change between samples. Some Zero 1.9 analyzer scan counters are negative: keep them in raw diagnostics and ignore them.
- Inspector `rowCount` includes related rows (reported as `inspectorRows`). Root counts come from a separate untimed verification pass.
- Zero caches views by AST, so two query names with the same AST (for example admin `availableDivisionsByCenter` and `availableDivisions`) show up as one view.
- Record results, accepted changes and rejected hypotheses in the [query performance audit](../query-performance-audit.md).
