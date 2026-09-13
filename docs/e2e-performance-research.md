# E2E runtime research

The paired local login/dashboard benchmark improved from 77.32s to 33.23s, including setup, build, and teardown. Both runs passed the same 30 cases and skipped the same 2 cases with four workers and no retries. The final full-suite verification passed 531 tests with no failures or retries.

## Pre-change baseline

Playwright collected **1,975 project-qualified cases from 96 spec files** with `BASE_URL=http://localhost:3099 bunx playwright test --config packages/e2e/playwright.config.ts --list --reporter=json` on 2026-09-13. Project counts were `super_admin` 422, `admin` 397, `finance_admin` 397, `volunteer` 397, `unoriented_volunteer` 314, `unauthenticated` 24, `kalakriti_release_invariants` 12, and `setup` 12. Collection is neither executed coverage nor runtime. Many role-only tests reached `test.skip(testInfo.project.name !== ...)` after fixtures started; the old automatic `consoleErrors` fixture also required `page` for API-only tests. [Playwright fixture execution order](https://playwright.dev/docs/test-fixtures), [annotations](https://playwright.dev/docs/test-annotations).

The [successful CI run 34713150662](https://github.com/proud-indian-ngo/dash/actions/runs/34713150662) took **9m37s**, from `checks` starting at 19:05:59 UTC to `e2e-status` finishing at 19:15:36 UTC. The critical path was 74s `checks`, a 2s gap, 65s `prepare-shards` (including a 29s web build), a 3s gap, 7m03s for the slowest `e2e (1)` shard (including 5m35s in Playwright), a 3s gap, then 7s `e2e-status`. The four Playwright steps took 335s, 295s, 299s, and 265s. These are GitHub Actions job/step timestamps, not per-test timings.

The pre-change local dev-server smoke (`dashboard/dashboard.spec.ts` and `auth/login.spec.ts`, four workers, no retries) took **77.32s overall** and **25.587s in Playwright**, with **30 passed and 2 skipped**. Zero's workers became ready in about 4s; the runner then waited roughly **28 extra seconds** for its periodic `replicated up to watermark` diagnostic. The installed Zero 1.9.0 `zero-cache/src/server/runner/run-worker.js:59-66` starts the cache when `lazyStartup` is false and awaits `allWorkersReady()` before starting the HTTP dispatcher. The root health response therefore provides readiness without the extra diagnostic wait.

The old CI path already built and served the TanStack/Nitro production output in four duration-balanced shards. Each shard repeated Postgres/Zero setup, seeding, dependency installation, auth setup, and server startup. The old local runner recreated Postgres, migrated and seeded, started Zero, waited for the log watermark, then started Vite dev and Playwright. The old duration reporter stored passed cases only; skipped cases received a 10s fallback in the shard planner and could distort balancing.

## Implemented changes

- `project-selection.ts` statically excludes files whose every test belongs to another role; shared multirole files retain their existing projects. The release-invariant files remain in their one-worker project. The old/new `--list` comparison retains every previously executed case by project, file, and complete test title (ignoring line/column changes). [Playwright project filters](https://playwright.dev/docs/test-projects).
- `global-setup.ts` signs in actors through Playwright's `request` fixture and writes `request.storageState()`, avoiding twelve setup browser navigations. It uses a distinct `192.0.2.x` `x-forwarded-for` address per actor so setup sign-ins do not consume the normal browser tests' localhost rate-limit bucket if rate limiting is enabled. Better Auth documents `x-forwarded-for` as its default IP header and sign-in rate-limit rules; [RFC 5737](https://www.rfc-editor.org/info/rfc5737/) reserves `192.0.2.0/24` for examples. This is safe only on this isolated local test server; untrusted forwarded-IP headers at a public origin would allow spoofing. [Playwright API authentication](https://playwright.dev/docs/auth), [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit).
- API authorization and object-access specs now use the `request` fixture without asking for a browser page. `fixtures/test.ts` attaches browser-error collection only when a test requests `page`; browser UI cases retain that annotation. The API checks still call the live app and database-backed authorization. [Playwright API testing](https://playwright.dev/docs/api-testing), [fixture laziness](https://playwright.dev/docs/test-fixtures).
- `run-e2e.sh` now builds the optimized Nitro output with `NODE_ENV=production` and serves it locally with `NODE_ENV=test` by default; `E2E_SERVER=dev` selects Vite dev. The test runtime keeps localhost WebSocket behavior rather than asserting deployment CSP behavior. The runner starts the build while Zero initializes, sets `ZERO_LAZY_STARTUP=false`, and waits for Zero's HTTP root instead of a periodic debug log line. It records environment-ready, Playwright, and total times. A fresh build is required for changed source or build-time env values. Vite dev transforms modules on demand; a production build has an up-front cost that may make a single-spec run slower. [Vite performance](https://vite.dev/guide/performance), [build and dev commands](https://vite.dev/guide/cli), [build-time modes](https://vite.dev/guide/env-and-mode).
- The one-worker release-invariant project starts alongside the other role projects rather than waiting behind their queue. Its cases remain serialized, but its runtime overlaps ordinary role coverage.
- The shared E2E actors exceeded the app's per-user query/mutation budgets under faster parallel execution, producing HTTP 429s and UI timeouts. The app multiplies its in-memory budgets by 100 only when the validated runtime is `NODE_ENV=test` and `VITE_E2E=true`; ordinary production/development limits remain unchanged and are unit tested. Both the optimized local runner and CI opt in. The two fixture DB guards now accept the runner's expected `E2E_DB_PORT` while retaining localhost and test-database restrictions.
- The duration reporter now records intentional `skipped` as well as `passed` results (including successful retries), preserving prior timings for tests blocked by a serial failure so runtime skips receive their observed cost in future shard estimates. The local worker default is capped at four (or half the available CPUs on smaller machines); `--workers` overrides it. CI keeps Playwright's default and the same four duration-balanced `--test-list` shards.

CI now prepares the build and shard lists concurrently with checks; E2E jobs still require both to succeed. Applied to the baseline job durations, this removes about 65s from the critical path before tests start. That is a schedule estimate; the modified workflow has not been run on GitHub Actions.

## Local measurements

| Same login/dashboard selection | Baseline Vite runner | Optimized bundle runner |
| --- | ---: | ---: |
| Total, including setup and teardown | 77.32s | 33.23s |
| Playwright wall-clock | 25.587s | 9.213s |
| Passed / skipped / failed | 30 / 2 / 0 | 30 / 2 / 0 |

This is a 57% reduction in total time (2.33 times faster) and a 64% reduction in Playwright time (2.78 times faster) on the same local machine. These measurements establish an improvement for this selection, not a full-suite speedup or a universal upper bound.

Run the comparison with four workers and retries disabled:

```bash
PLAYWRIGHT_HTML_OPEN=never /usr/bin/time -p bash packages/e2e/run-e2e.sh \
  tests/dashboard/dashboard.spec.ts tests/auth/login.spec.ts \
  --workers=4 --retries=0
```

The old/new collection comparison is 1,975 to 1,358 cases, removing 617 already-skipped role/spec pairs. All 534 project-qualified cases, including setup, with recorded execution durations in the successful baseline CI run remain selectable. The final full-suite run passed **531 cases**, skipped **827**, and reported **zero failures, flaky outcomes, or retries**. It took **344.15s in Playwright** and **367.54s overall**, including setup and teardown. This verification used the four-worker default and `--trace=retain-on-failure`, which records every case before discarding successful traces. It is not directly comparable to the uninstrumented smoke benchmark or the four-machine CI baseline. Zero reported no HTTP 429 responses.

```bash
PLAYWRIGHT_HTML_OPEN=never /usr/bin/time -p bash packages/e2e/run-e2e.sh \
  --retries=0 --trace=retain-on-failure
```

An earlier four-worker full run took 310.26s but exposed two test defects: a dropdown closed between opening and assertion, and the local R2 upload smoke used text locators matching several legitimate copies of a Student name. The dropdown check now retries opening and all four assertions together; the refresh checks select a matching visible representation. A five-worker experiment took 347.18s and also hit a food-flow timeout, so the local default is capped at four. These failing experiments are diagnostic results, not successful benchmark comparisons.

Repository verification passed `bun run check:types`, `bun run check`, `bun run test:unit`, and `bun run check:unused`. The process-cleanup tests and direct duration-reporter checks also passed. The modified GitHub Actions workflow has not been executed remotely.

## Speed limits and further experiments

The four-worker verification run spent 205.7s inside the twelve serialized release-invariant cases. A single shared database cannot beat that serial lane merely by adding browser workers; setup and teardown add to it. Multiple isolated database stacks can split those cases across machines, as CI already does with four shards. This is a measured constraint of the current tests, not a universal speed limit.

A persistent local stack or cached build could reduce repeated setup, but both require reliable invalidation and fixture cleanup across runs. The runner currently chooses a fresh build and database for reproducible results. Replacing browser workflows with mocks would change what E2E proves; only HTTP-only authorization tests were moved to browser-free requests against the real server. Switching browser frameworks would not by itself remove these measured startup, scheduling, and quota bottlenecks.

Compare the dev fallback for targeted work. On CI, compare 2, 4, and 6 shards with 1-2 workers per shard only after confirming project/test coverage and retries. More shards have diminishing returns because each repeats stack setup, and the serial release-invariant lane sets a lower bound. Playwright recommends one worker on ordinary CI agents; native `--shard=x/y` is an alternative to compare with the current historical-duration planner, not an assumed improvement. [Parallelism](https://playwright.dev/docs/test-parallel), [CI worker guidance](https://playwright.dev/docs/ci), [sharding](https://playwright.dev/docs/test-sharding), [test-list limitations](https://playwright.dev/docs/test-parallel).

## Follow-up full-suite baseline, 2026-09-13

A fresh full-suite run with the current four-worker default, `--retries=0`, and `--trace=off` completed successfully. This is a single-run baseline for the next optimization, not a before/after speedup measurement.

| Metric | Result |
| --- | ---: |
| Total including setup and teardown | 415.27s (6m55s) |
| Playwright wall-clock | 389.85s (6m30s) |
| Environment setup | 21s |
| Passed / skipped / failed / flaky | 530 / 828 / 0 / 0 |
| Serial invariant test durations | 303.97s (5m04s) |
| Aggregate worker time in skipped cases | 113.71s |

The one extra skip compared with the prior 531-pass verification was the WhatsApp picker test, whose existing runtime guard skips when the external API is unavailable. The same 1,358 cases were selected. No implementation changes were made for this run.

The untraced run was slower than the earlier traced verification, demonstrating variation between runs; do not attribute the difference to tracing or infer a full-suite speedup from those two measurements. The serial invariant lane remains the largest measured constraint.

## Two-stack experiment, 2026-09-13

Two concurrent local stacks did not demonstrate a successful speedup. The corrected full run took **426.37s (7m06s)**, compared with the clean single-stack baseline of **415.27s (6m55s)**, and failed one transport invariant. Keep the single-stack runner as the default.

The opt-in `bun run packages/e2e/run-two-stacks.ts` command partitions whole spec files across two isolated source snapshots, each with its own database, Zero instance, server, build caches, authentication state, and artifacts. Each stack uses two Playwright workers, no retries, and no tracing. Historical timings balance the invariant lane first, then the remaining files. Both stacks repeat the twelve authentication setup cases.

| Run | Total including setup and teardown | Outcome |
| --- | ---: | --- |
| Clean single-stack baseline | 415.27s | 530 passed, 828 skipped, no failures |
| First two-stack attempt | 384.06s | Failed a public-event list count assertion |
| Repeat before cache isolation fix | 220.02s before cancellation | Shared Nitro cache caused missing JavaScript assets; aborted |
| Corrected two-stack experiment | 426.37s | 547 passed, 822 skipped, one failure |

The corrected run selected exactly the same 1,358 unique cases as the baseline, with no missing or extra cases and no duplicated cases outside setup. Its totals include twelve additional setup executions. Stack one completed Playwright in 391.59s with 294 passed and 367 skipped; stack two took 393.76s with 253 passed, 455 skipped, and one failure. Both stacks spent 28s preparing their environments. The failed case was the center scan session workflow in `kalakriti/event-day-transport.spec.ts`, which reached its 135s timeout. Its cause remains unresolved; the failed runs are not evidence of a reliable speedup.

The experiment exposed two issues that were corrected before the final run. Public-event filtering now asserts the seeded public and private links across filter changes instead of comparing counts while live data is still arriving. Snapshot creation excludes writable dependency caches, including `.nitro`, to prevent concurrent builds from mixing server asset manifests. Partition and snapshot tests cover exact assignment and filesystem isolation.

Local benchmark artifacts are retained in the printed temporary run directory. The corrected run directory ends in `pi-dash-e2e-stacks-JPezFv` and contains `summary.json`, `coverage.json`, and each stack's report and log. Additional stacks on this machine are not justified by these results; any future experiment needs a clean full-suite pass and a repeatable improvement over the baseline.
