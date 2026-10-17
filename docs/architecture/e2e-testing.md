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

Some state reaches every spec on the stack: a second active cost centre makes every event and request form ask for a city, and a closed FY 2026-27 refuses statement imports and line actions dated in it. Such specs go in `exclusiveLastSpecs` (`project-selection.ts`) and run in `exclusive_last`, the teardown of `setup`, which Playwright starts once every project depending on `setup` has finished. It has no dependencies, so a failure elsewhere doesn't skip it. A teardown doesn't pull in setup, so `run-e2e.sh` adds `global-setup.ts` whenever spec files are named. Other cost centre specs add their centres inactive and run in parallel; seeding deactivates any `E2E…` centre a stopped run left active.

## Global setup and auth

`global-setup.ts` signs in each shared role and each active Kalakriti actor through the API and saves storage state under `.auth/`. Each actor sends a distinct `192.0.2.x` `x-forwarded-for` address, so setup does not use up the localhost rate-limit bucket that browser login tests share.

The shared fixture in `fixtures/test.ts` listens for browser errors only when a test requests `page`. API-only authorization tests use `request`, so they exercise the live HTTP and Zero authorization path without a browser.

Fixture users are inserted by `helpers/seed-test-user.ts`, bypassing Better Auth sign-up, email verification and the 18+ date-of-birth check. Public self-registration is covered by `tests/auth/register.spec.ts`.

## Seeding and DB isolation

Feature helpers in `helpers/` add the entities a spec needs. They must be idempotent (`onConflictDoNothing()`) and return inserted IDs. `helpers/seed-dev-data.ts` seeds development data for cloud sessions; the harness does not run it.

`run-e2e.sh` starts its own Postgres (`pi-dash-test` on loopback) with ports derived from `WORKTREE_ID`, so runs never touch the dev database.

## `run-e2e.sh`

- Zero runs in production mode with a test-only `ZERO_ADMIN_PASSWORD` (default `e2e-test-admin`). Inspector-based tests authenticate with that env value; they must not rely on the interactive prompt or the development-mode bypass.
- The production build is served with `NODE_ENV=test`. This keeps localhost WebSocket behaviour and does not verify deployment CSP.
- `VITE_E2E=true` with `NODE_ENV=test` raises in-memory API rate budgets 100 times for shared E2E users.

`E2E_STACK_INDEX=1|2` gives a run its own ports and container names. Benchmarks use `E2E_STACK_INDEX=2` so they can run beside an ordinary stack.

## Release-invariant lane

Specs that touch the database-wide single-live-Edition constraint run only in `kalakriti_release_invariants` with one worker. Distinct fixture IDs do not isolate them. The project is queued before the role projects so its serial work overlaps theirs.

- Put new live-Edition specs in this lane and add them to `releaseInvariantSpecs` in `project-selection.ts`.
- `event-day-transport.spec.ts` uses isolated Edition 2166 and its own Guardian. `event-day-stations.spec.ts` uses live Edition 2168 and draft Edition 2169.
- Cleanup removes Center scan stages before Centers because their composite foreign key is restrictive.
- Transport fixtures must finalize pickup and venue arrival before testing departure.

## CI sharding

CI splits E2E across four shards with `shard-by-duration.ts`, which bin-packs project-qualified cases by the timings in `.test-durations.json` (cached per branch, falling back to `master`). `duration-reporter.ts` records the timings and CI saves them back. Sharding leaves out `[setup]` and `[exclusive_last]` rows, since they run in every shard.

## Two-stack run

`run-two-stacks.ts` is an opt-in way to run the whole suite on two independent local stacks; the normal runner stays single-stack.

- The coordinator snapshots tracked and non-ignored working files, so uncommitted changes are included.
- Never link writable `.nitro`, `.vite`, `.vite-temp` or `.cache` between snapshots: a shared Nitro directory mixes asset manifests from concurrent builds and serves missing chunks.
- `partition-specs.ts` keeps every project's cases for a spec file on one stack, preserving serial and `beforeAll` dependencies.

### Books serial group

Matching FY 2026-27's audited figures freezes that year for every spec on the same database. So every test that posts into the books and waits on the result (the `postings` helper step, Books → Post pending) or matches audited figures (`post-audited`, `reverse-audited`) lives in the serial "Books (treasurer)" group of `tests/finance/books.spec.ts`. That includes voiding a posted reimbursement and payment proof. The Budgets spec posts at once into FY 2027-28, which nothing freezes, so it stays outside. Every test that closes the year (`close-year*`) lives in `tests/finance/books-year-close.spec.ts`, which runs last, alone. The partition keeps each file on one stack, and `books-serial-group.test.ts` fails when another spec uses those steps.

## Performance benchmarks

Benchmarks are opt-in specs under `tests/performance/`, skipped unless their flag is set. All of them run as `super_admin` on an isolated stack:

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

Each Zero query gets three analyzer samples after initial hydration. JSON reports are attached to the Playwright report and hold counts, timings and sanitized plans only, never record contents, filter values or credentials. No timing threshold is enforced.

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
