# Rendering performance audit

The shared table filter evaluator now prepares its query tree, membership operands and date bounds once per query instead of recreating them for every row. A controlled Chromium workload reduced evaluation time by about 79% and sampled temporary allocation by about 95%. These are evaluator improvements, not claims that every dashboard interaction became that much faster.

## Measurement conditions

The baseline is `d2cd241c`. Measurements used Chromium 156.0.8078.4 on an Apple M1 Pro with 10 logical CPUs and 32 GiB RAM, a 1366×768 viewport and 4× CPU slowdown. This is a reproducible laptop stress profile, not calibration to a particular laptop model.

Runs were sequential, but the host also had background indexing and browser activity. Small navigation-time differences cannot be attributed confidently to the filter change.

The app ran as a production build against the repository's disposable local E2E database. Fixtures contain 1,000 synthetic users, 600 events, 1,000 reimbursements, 500 advances and 1,000 vendor payments, plus supporting records. Permissions and page windows mean not every seeded record appears on screen. The navigation sequence visits Users, Events, Reimbursements, Teams and Dashboard eight times in one document, preserving caches. The app measurements use local networking without network throttling.

Each navigation records renderer script, layout, style and task time, samples JS heap every 50 ms, then forces GC. Dashboard checkpoints compare retained heap, DOM nodes and listeners at the same route. OS RSS covers the benchmark browser's processes. CPU profiles and optional warm/final heap snapshots run separately after measurements. RSS sums may double-count shared pages; sampled heap peaks are lower bounds.

Commands and flags live in [E2E testing](architecture/e2e-testing.md#profiles-and-query-reports). Raw reports, browser bundles, CPU profiles and heap diagnostics stay under the ignored `tmp/rendering-performance/` directory.

## Filter evaluation

Each sample compiles and applies a nested status, tags, amount and relative-date filter 20 times to 5,000 rows. Five warm-up passes precede seven samples. Every sample returns exactly 49,500 matches. Allocation sampling runs separately from timing and includes collected objects.

Two fresh-browser pairs ran in opposite order:

| Measurement | Original | Optimized |
|---|---:|---:|
| Pair 1, median evaluation time | 249.4 ms | 55.8 ms |
| Pair 2, median evaluation time | 273.9 ms | 54.3 ms |
| Pair 1, sampled allocated bytes | 91.12 MB | 4.41 MB |
| Pair 2, sampled allocated bytes | 90.95 MB | 4.22 MB |

These totals cover 100,000 row evaluations per sample. Allocation sampling is approximate. Both diagnostic retained-allocation samples were zero after GC; this change reduces garbage creation and processing, not an established persistent leak.

Compilation preserves short-circuiting and permissive fallbacks for incomplete filters. Malformed date operands must remain safe even on unreachable branches because compilation visits the whole tree. `has_all_of` retains a per-row set to avoid quadratic work for large arrays.

## App CPU and memory footprint

The matched `original-measured` and `optimized-measured` reports exclude snapshot overhead. Warm navigation medians below use rounds 2–8. Navigation includes automation/readiness overhead; script time is renderer main-thread time under throttling.

| Route | Navigation before / after | Script time before / after |
|---|---:|---:|
| Dashboard | 750 / 709 ms | 595 / 551 ms |
| Users | 582 / 555 ms | 281 / 268 ms |
| Events | 424 / 367 ms | 239 / 225 ms |
| Reimbursements | 799 / 652 ms | 455 / 408 ms |
| Teams | 465 / 419 ms | 259 / 245 ms |

These routes use their default filters, so this is a regression screen rather than proof of an end-to-end filtering improvement.

| Memory observation | Before | After |
|---|---:|---:|
| Sampled JS heap peak | 67.3 MiB | 61.1 MiB |
| Final Dashboard post-GC heap | 44.7 MiB | 45.6 MiB |
| Post-warm-up heap growth over seven cycles | 2.88 MiB | 3.19 MiB |
| Maximum renderer RSS checkpoint | 235.5 MiB | 268.3 MiB |
| Maximum summed browser-process RSS checkpoint | 450.0 MiB | 506.2 MiB |

Whole-app resident memory did not improve. For capacity planning, this workload occupied roughly 46 MiB of retained JS and up to 268 MiB of renderer RSS, with a dedicated browser session around 506 MiB. Allow additional headroom for longer sessions and media-heavy routes; these observations do not certify a minimum RAM configuration. DOM growth after warm-up was zero/eight nodes before/after, with two/one extra listeners.

For future audits on this fixture and hardware profile, review filter evaluation above 100 ms per 20-pass sample or sampled JS heap above 100 MiB. These are investigation thresholds with headroom, not portable CI timing assertions. Dashboard and reimbursement main-thread work remain the highest-priority route-level targets.

## Heap investigation and rejected changes

An eight-cycle diagnostic run grew from 43.79 MB to 47.02 MB of post-GC heap. Growth slowed from about 0.9 MB to 0.25 MB per cycle. DOM nodes changed from 1,104 to 1,109 and stopped growing; listeners went from 480 to 475.

Comparing warm/final snapshots, the largest shallow retained-size increases were engine code (3.13 MB), native objects (0.43 MB), object shapes (0.064 MB), plain objects (0.060 MB), closures (0.028 MB) and arrays (0.027 MB). Timing/network/style bookkeeping also grew. No app-specific constructor dominated. This supports engine and instrumentation retention as the main explanation; it is not a retaining-path proof that all app memory is leak-free. Snapshot capture itself inflated native RSS, so this diagnostic run is excluded from resource budgeting.

The broader source and CPU review did not justify these changes:

- Extra table memoization: production React Compiler output already caches filtered data, view counts, options and icons.
- Table virtualization: row DOM is already pagination-bounded.
- Photo object-URL cleanup: the event gallery uses HTTP media URLs; other blob preview/download paths already revoke their URLs.

Earlier width-cache and reduced-motion experiments are covered in [normal-use responsiveness](query-performance-audit.md#normal-use-responsiveness).

Profiles still show material Zero view construction and Base UI scroll/layout work. Photo-gallery scaling, hidden-tab polling and large Kalakriti catalogs remain candidates for workload-specific measurement, not demonstrated improvements from this audit.

## Interpretation

The filter result is reproducible CPU and allocation evidence. Main-route measurements cover navigation and mounting with scale fixtures; they do not establish field INP, production percentiles, all role combinations, image-decoding budgets or overnight leak behavior. Browser resource observations are not minimum system-RAM requirements. Retest the same workloads on an actual target device before setting a hardware support floor.
