# Query performance audit coverage

Status: incomplete. Inventory checked against `packages/zero/src/queries.ts` and its query definitions on 2026-09-14. There are 32 registered groups and 88 named query variants. The authenticated large-fixture reports cover 66 distinct variants; coverage below means measured under at least one account, not proven fast for every permission scope or dataset.

Evidence: `packages/e2e/tests/performance/kalakriti.spec.ts` and `packages/e2e/tests/performance/app.spec.ts`, with their JSON report attachments. Commands, fixture sizes, account scopes, timings and limitations are recorded in [E2E architecture](architecture/e2e-testing.md). SQLite reads, synced rows, server hydration and total hydration are separate measurements. Broad local caching is intentional; root scans and row counts alone do not establish waste.

## Zero variants

| Group | Large-fixture measurement exists | No large-fixture measurement yet |
|---|---|---|
| `advancePayment` | `all`, `byId` (admin, owner, denied) | `byCurrentUser` |
| `appConfig` | None | `all` |
| `bankAccount` | `bankAccountsByCurrentUser` (admin/volunteer) | None |
| `eventFeedback` | `byEvent` | None |
| `eventImmichAlbum` | None | `byEvent` |
| `eventInterest` | `allPending`, `byCurrentUser` | `managerByEvent`, `myByEvent` |
| `eventPhoto` | `allPending`, `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` | `byEvent` |
| `eventUpdate` | `allPending`, `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` | `byEvent` |
| `expenseCategory` | `all` (admin/volunteer) | None |
| `kalakritiAssignment` | `roster`, `myAccess` (admin/Guardian/liaison) | None |
| `kalakritiCenter` | `visible`, `guardianAssignments`, `liaisonAssignments` (admin) | None |
| `kalakritiCompetition` | `categories`, `competitions`, `sessions`, `venues` | None |
| `kalakritiEdition` | `readiness` (global admin), `byYear` (admin, Guardian, liaison), `cloneSource` (admin/Edition admin), `configurationAccessible` (Edition admin), `accessible` (admin/Guardian/liaison/Edition admin) | `byTeamEventId` |
| `kalakritiEligibility` | `ageCategories` (admin/Edition admin) | None |
| `kalakritiEntry` | `availableDivisions`, `visible`, `visibleByCenter`, `availableDivisionsByCenter` (Guardian/liaison), `visibleByDivision` | `byId` |
| `kalakritiFood` | `students`, `memberships` | None |
| `kalakritiGuardian` | `roster` | None |
| `kalakritiStudent` | `visibleForCompliance`, `visibleForDirectory`, `visibleByCenter`, `visibleForEntries`, `ageCategoriesByCenter` (admin/Guardian/liaison) | None |
| `kalakritiCenterScan` | `byCenter` | None |
| `kalakritiAttendee` | `visible` (admin Guest and Judge) | None |
| `kalakritiTransport` | `byCenter` | None |
| `notification` | `forCurrentUser` (admin and volunteer) | None |
| `notificationPreference` | `byCurrentUser` (admin/volunteer), `byUser` (admin) | None |
| `reimbursement` | `all`, `byId`, `byEvent` (admin/owner) | `byCurrentUser` |
| `scheduledMessage` | `all` (admin) | `byId` (no mounted production consumer) |
| `team` | `byCurrentUser` | `all`, `byId` |
| `teamEvent` | `allAccessible`, `byCurrentUserAll`, `byId` | `byCurrentUser`, `byIdWithExpenses`, `byTeam`, `public` |
| `user` | `all`, `whatsappUsers` (admin) | `one` |
| `vendor` | `all`, `approved`, `pendingByCurrentUser` (admin/volunteer) | `byId` (no production consumer) |
| `vendorPayment` | `all`, `byId`, `byEvent` (admin/owner) | `byCurrentUser` |
| `vendorPaymentTransaction` | None | `byId`, `byVendorPayment` |
| `whatsappGroup` | `all` (admin) | None |

## Scope and remaining work

- Financial lists cover admin and owner accounts. Reimbursement and Vendor Payment details include allowed and denied reads. Attachments, deep financial histories and recurring Events remain unmeasured. Event detail update/photo metadata and aggregate feedback now have populated admin and volunteer coverage; media transfer is excluded.
- Kalakriti Students, Entries and Food cover global admin plus two-Center Guardian and liaison accounts. Competition/category leads, coordinators and Edition-wide volunteer responsibilities need their own plans. Admin Competition category and venue tables have only one fixture record, so their existing measurements do not establish scaling behavior.
- Guest and Judge rosters cover admin access with populated operation history and Judge assignments. Restricted Judge assignment visibility remains unmeasured.
- Center transport covers admin, Guardian and liaison; Scan covers admin and liaison. Live mutations, camera processing and finalized scan-stage history are outside those measurements.
- Dashboard PostgreSQL aggregate execution is measured for four supplied scopes. Authentication and scope resolution are excluded from those timings; supplying a scope directly is not an authorization test.
- Analytics reuses the measured financial queries, but its client aggregation and chart rendering have not been profiled. Query reuse does not prove page performance.
- Global Audit Log has the populated PostgreSQL/HTTP baseline below. Kalakriti Audit now has the scoped baseline below; Jobs still needs a populated workload and plans. These server reads are not represented by the Zero registry table.
- Production disk latency, CPU contention and CVR behavior remain a separate investigation. The September 14 PostgreSQL snapshot below found no replication byte lag during its short sample; it does not establish sustained health. Local benchmarks cannot establish production health.

## Proven changes and current priority

Food's admin permission shortcut reduced local analyzer time and relationship reads while preserving results. Assignment indexes reduce repeated membership and scoped authorization scans; the two scoped indexes did not materially improve local latency. Bounded route preload ownership and intent preloading address speculative navigation work. The request detail loading fix prevents a premature empty state while either lookup remains pending.

Entries is the largest measured hydration workload: approximately 1.2 seconds in the analyzer, 36,000 reads and 9,103 unique synced rows for 3,000 Entries. Removing the unused nested member Student Center relation reduced reads from 39,000 and median analyzer time from 1,332 ms to 1,202 ms on the same fixture. The Entry Center and separate Student picker Center labels remain available. Further graph changes require consumer evidence; preserve full local datasets, permission boundaries, filters and detail behavior. Continue through the unmeasured variants and HTTP surfaces above, recording representative scopes and evidence before declaring the audit complete.


## Entry eligibility CPU profile

The session page and registration picker now build an Entry-by-Student map once per calculation, then pass each Student's Entries to the existing eligibility rules. This avoids scanning the whole Entry list for every option. The map is rebuilt from current inputs, preserves Entry order and counts a group Entry once per Student. It does not cache authorization or change submission validation.

Run `env -u ELECTRON_RUN_AS_NODE bun apps/web/scripts/profile-entry-eligibility.ts` to compare the full-list and indexed calculations. The synthetic workload has 3,000 Entries and profiles 150 and 1,500 Students, discarding one warmup and reporting five samples. Index construction is included. Local Bun medians were about 7.9 ms versus 0.4 ms for 150 Students, and 59 ms versus 0.6 ms for 1,500 Students. Every option remains eligible in this benchmark; separate unit cases verify age/gender exclusions, existing registration, group editing, limits, overlapping sessions and duplicate member handling. These are CPU measurements, not browser rendering or network timings.

Verification: 16 focused eligibility tests and the full unit/type/lint/unused checks pass; 24 browser checks pass with four role-inapplicable skips. React Doctor reports existing branch route-ordering and component issues, including complexity in the edited session page; it does not establish an eligibility regression.


## Dashboard review and server-read follow-up

Dashboard coverage now includes current-user Teams and interests plus pending interests, updates and photos. Current-user interest analysis for an account with `events.view_all` initially read 2,400 rows for 600 interests and 1,200 unique synced rows. Skipping the redundant Event-existence authorization predicate for that permission reduced reads to 1,200 and median analyzer time from 84 ms to 42 ms. The non-null Event foreign key guarantees existence; the owner filter and related Event remain, and restricted accounts still use the original Event access predicate.

The server-read workload inventory includes global Audit Log (page/count plus distinct-action/type facets), Kalakriti Audit (snapshot-scoped page/count with domain and category filtering), and Jobs (list/count plus queue stats). Ordinary audit seeds have only one row each; the opt-in benchmarks below supply scale evidence. Use isolated populated fixtures and authenticated HTTP timings plus PostgreSQL plans; the Jobs schema must first be initialized by the local Nitro worker. No index change is justified by source inspection alone.


## Production PostgreSQL snapshot, September 14

A read-only `pgbot` 0.8.1 inspection at 2026-09-14 06:47 UTC sampled PostgreSQL 18.3 for approximately 1.46 seconds. The connection enforced `default_transaction_read_only=on` and a 10-second statement timeout. Inspection used `--json --no-store --fail-on none --timeout 30s --ash-hz 0`; credentials were supplied through the process environment, and the raw report remains outside the repository. No production settings, extensions, indexes or data were changed.

| Signal | Observation | Limit |
|---|---|---|
| Replication | Zero replicator streaming; write, flush and replay byte lag all zero; active logical slot retained 640 bytes | One snapshot, not sustained lag monitoring |
| Contention | Zero blocked sessions; no sampled deadlocks | Does not exclude contention during slow navigation |
| Database activity | Approximately 67 transactions/second; no sampled temporary-file spills | Short interval; no representative navigation workload was correlated |
| Connections | 36 in the activity sample; a separate limits scrape counted 31 against a maximum of 100 | Scrapes occurred at different times |
| Cache | All 1,961 sampled block accesses were hits | Does not measure replica disk latency or prove sufficient memory |
| Query instrumentation | `pg_stat_statements` unavailable; `track_io_timing` off | Cannot rank expensive statements or report their block I/O time |

The database was approximately 105 MiB. Zero's CVR `rows` table accounted for approximately 65 MiB and had high cumulative update activity. Low HOT-update ratios in CVR and pg-boss tables are investigation candidates, not evidence that changing vendor-owned schemas or fillfactor will improve navigation. Autovacuum activity was present; tuple estimates and cumulative update counts are not latency measurements.

The tool also reported unindexed foreign keys and overlapping indexes. These are heuristic candidates, not an approved migration list. Missing foreign-key indexes can affect parent updates/deletes without explaining page reads; overlapping-index reports can list one index against several wider indexes. The integer primary key warning concerned Drizzle's migration ledger and does not explain the current performance symptoms.

The next production evidence should combine a representative navigation window with statement statistics and I/O timing. Enabling `pg_stat_statements` requires adding it to `shared_preload_libraries`, restarting PostgreSQL and creating the extension in the database; I/O timings require `track_io_timing`. These changes have not been authorized or applied. See the [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/pgstatstatements.html). PostgreSQL measurements cover upstream and CVR work; Zero's SQLite hydration plans still require its analyzer, and replica storage/CPU measurements remain outstanding.


## Global Audit Log baseline

`AUDIT_PERFORMANCE=true` enables the isolated Audit Log benchmark. It inserts 50,000 deterministic synthetic rows idempotently, runs `ANALYZE`, and profiles the exact production Drizzle builders. The API continues to execute page, count and two facet queries concurrently with unchanged authentication and filters. The report retains plan nodes, row/block counts and timings but omits filter values and record contents. Three sequential SQL samples per query and three authenticated HTTP samples per scenario are separate measurements; their timings must not be added or compared as concurrent request components.

| Scenario | Page SQL median | Count SQL median | HTTP median |
|---|---:|---:|---:|
| Default, first 20 | 13.6 ms | 7.3 ms | 18.6 ms |
| Offset 40,000 | 29.5 ms | 12.5 ms | 19.5 ms |
| Action equality | 3.2 ms | 1.5 ms | 13.1 ms |
| One-day range | 0.4 ms | 0.4 ms | 13.3 ms |
| Substring search | 163.9 ms | 172.9 ms | 151.0 ms |
| Type/outcome/date combination | 5.2 ms | 3.4 ms | 13.2 ms |

Search matched 11 rows but filtered all 50,001 rows separately for the page and count. Deep pagination performed an external merge sort with approximately 8.3 MiB of sort space. Distinct-action and distinct-type facets each scanned the full table even on narrowly filtered requests. These are measured candidates for further experiments, not deployed fixes. The fixture is larger than the approximately 3,139 estimated production audit rows seen in the PostgreSQL snapshot, and its uniform synthetic distribution is not a forecast of production latency.

Verification: 13 E2E checks passed (12 authentication setup checks plus the benchmark). The benchmark checks six response totals and page lengths, facet presence, repeat-seed totals and a volunteer's HTTP 403. It does not measure browser rendering or exercise every authorization role.


### Facet scan reduction

The Audit Log now computes action and target-type options with one `GROUPING SETS` query. PostgreSQL groups each dimension independently, then sorts only the distinct groups. The loader separates the groups using `GROUPING(action)` and preserves the original ordering and null/empty target-type handling. The benchmark compares the production loader's option arrays exactly against the original distinct queries. See [PostgreSQL's grouping documentation](https://www.postgresql.org/docs/18/functions-aggregate.html).

On the same 50,001-row database, facet scans fell from 100,002 rows and 2,418 shared block hits across two queries to 50,001 rows and 1,209 block hits. The grouped query took about 14 ms versus approximately 20 ms of combined sequential SQL work for the original queries. This is a database-work reduction, not a demonstrated HTTP latency improvement: the original queries ran concurrently, and filtered HTTP medians moved from approximately 13 ms to 16 ms. Search remained approximately 151 ms. A preceding sorted `array_agg(distinct ...)` experiment was rejected because it sorted all rows and took approximately 70 ms.

The benchmark retains the original two facet queries as comparison measurements, without using them in the API. Search and deep-page sorting remain open optimization candidates. No schema or production configuration changes accompany the facet query change.


### Pagination index experiment

An ID-only pagination subquery reduced the deep-page sort from approximately 8.3 MiB to 1.6 MiB but still spilled and did not consistently improve HTTP timing. That query rewrite was discarded.

A disposable local experiment instead added `(attempted_at DESC, id DESC)`, matching both ordering columns in the unchanged production query. With the same 50,001 rows, first-page SQL fell from approximately 14 ms to 0.03 ms and touched four shared blocks for 20 rows. Offset 40,000 SQL fell from approximately 29 ms to 5.15 ms, visited 40,020 index rows and no longer sorted or spilled. Deep-page HTTP median was 16.8 ms; facets/count still contribute to the endpoint. Substring search remained approximately 147 ms HTTP and needs separate work.

The benchmark now asserts exact expected record IDs and ordering for all six cases, in addition to totals, facet equivalence and restricted access. All 13 E2E checks passed with the experimental index. The approved index is now generated in migration 0086 as `audit_log_attempted_at_id_idx`. The normal benchmark requires that migration and verifies its presence. It has not been deployed. Existing indexes remain unchanged.

Migration verification caught Drizzle generating `DESC NULLS LAST`, which did not satisfy the query's `DESC NULLS FIRST` ordering and left the sort in place despite both columns being non-null. The final schema specifies `.desc().nullsFirst()` on both columns. The benchmark now requires the named index in first/deep-page plans and zero temporary written blocks, so merely creating an unused index cannot pass this check.


### Search count experiment

The search benchmark now includes selective (11 matches), broad (50,000 matches), empty and past-end-offset cases, with exact IDs, ordering, totals and bounded page lengths. A `count(*) over()` experiment shared the filtered scan for ordinary search pages and used a separate count only when an empty page at a positive offset could not carry the total. It preserved results but was discarded after measurement:

| Search case | Existing HTTP median | Window-count HTTP median |
|---|---:|---:|
| Selective | 145 ms | 144 ms |
| Broad | 35 ms | 58 ms |
| Empty | 141 ms | 143 ms |
| Offset past 11 matches | 143 ms | 282 ms |

The broad window query wrote 1,056 temporary blocks; the existing limited page can stop earlier while its independent count uses a narrower projection. The past-end fallback repeated the search sequentially. The production query remains unchanged. Both benchmark runs passed all 13 E2E checks (12 authentication setups plus the nine-scenario benchmark). Query-count reduction alone does not establish a performance improvement. Further search experiments should preserve these cases, the case-insensitive substring semantics and all five searched fields; this phase adds no extension or search index.


## Debounced server-table search

The shared table search already waits 300 ms before committing text to URL state. Previously, typing from page two reset the page immediately, producing one Audit Log request with the old search at offset zero and a second request with the final text. The browser regression explicitly clicks to page two, verifies offset 20, types a synthetic search and records requests. It failed with two requests before the change and passes with exactly one afterward.

Server-paginated tables now reset pagination when the debounced search is committed. Client-paginated tables retain their immediate reset, and clearing search still commits immediately. This removes redundant request work without changing query shapes or caching authorization. The nine SQL/HTTP scenarios, exact results, denied access and browser request check pass in the 13-check E2E run; type, lint, unit and unused checks pass. React Doctor retains existing branch diagnostics, including the unchanged ref-initializer pattern in the shared wrapper.

## Kalakriti Audit populated baseline

The next audit endpoint is `/api/kalakriti/:year/audit`, backed by `apps/web/src/lib/server/kalakriti-audit.ts`. It combines an Edition predicate, domain/category authorization and `pg_visible_in_snapshot`, then reads page items and count. Global and Edition admins see every domain. Category leads see only competition and schedule configuration records associated with their category through target IDs or the supported metadata fields.

The opt-in benchmark seeds 40,000 records in the release Edition and 1,000 in another Edition. It profiles the production scope/snapshot/item/count builders and makes authenticated HTTP requests for global-admin, Edition-admin and category-lead actors. Every scenario checks exact IDs, order and totals. Repeated seeding is idempotent, requests reuse the returned snapshot, and a category lead's forbidden domain returns 403. Target-ID, scalar metadata and array metadata category membership paths all appear in the fixture.

Three-sample local medians with PostgreSQL 18.3:

| Actor | Page | Items SQL ms | Count SQL ms | HTTP ms |
|---|---|---:|---:|---:|
| Global admin | First | 21.36 | 10.15 | 24.38 |
| Global admin | Competition domain | 7.84 | 5.13 | 14.82 |
| Global admin | Offset 20,000 | 26.95 | 10.02 | 30.26 |
| Edition admin | First | 19.72 | 9.87 | 22.82 |
| Edition admin | Competition domain | 8.72 | 5.33 | 12.72 |
| Edition admin | Offset 20,000 | 25.46 | 9.90 | 27.09 |
| Category lead | First | 11.23 | 8.61 | 15.93 |
| Category lead | Competition domain | 7.31 | 6.30 | 12.89 |
| Category lead | Offset 5,000 | 12.08 | 8.83 | 21.12 |

First-page plans scan all 41,000 audit rows before sorting: admins retain 40,000 and category leads retain 10,000. The first-page sort stays in memory. This establishes a candidate for ordered-index experiments, not an approved schema change or production bottleneck. SQL samples execute sequentially; HTTP includes authentication and concurrent page/count work. Access resolution is recorded separately as a single observation, not a latency distribution. The benchmark does not prove snapshot behavior under concurrent writes or cover every audit role. The isolated E2E run passed all 13 checks (12 authentication setups and the nine-scenario benchmark).

### Ordered-index experiment

A disposable local index on `(edition_id, created_at DESC NULLS FIRST, id DESC NULLS FIRST)` reduced global-admin first-page item SQL from 21.36 ms to 0.046 ms and Edition-admin from 19.72 ms to 0.040 ms. Those plans read 25 audit rows rather than scanning 41,000. Category first-page item SQL fell from 11.23 ms to 0.082 ms, with 25 retained and 78 filtered rows. All nine scenarios retained exact results and the 13-check E2E run passed.

Global-admin first-page HTTP fell from 24.38 ms to 15.82 ms and Edition-admin from 22.82 ms to 16.06 ms. Category first-page HTTP was essentially unchanged (15.93 to 16.78 ms), since count and authentication still contribute. Deep offsets retained sequential-scan/sort plans and showed no consistent improvement. The disposable candidate was removed after measurement. Approved migration 0087 adds `kalakriti_audit_edition_created_id_idx` with this ordering; the real migration benchmark used that index and measured 0.041 ms first-page item SQL with exact results preserved. Production verification is pending. This supports a targeted first-page index, not a claim that counting or deep pagination is fixed.

## Production follow-up after PR 128

PostgreSQL restarted on September 14 at 08:06 UTC, all five approved indexes were present, and the `pg_stat_statements` extension was enabled and collecting data. Web and PostgreSQL were healthy, migrations exited successfully, and Entries/Students/Food returned 31/482/21 results. A bounded sample of the new application's logs contained no repeated concurrent-index maintenance error; this is not proof of sustained absence.

Five alternating browser samples produced median HTTP times of 371.4 ms for `/api/health`, 378.3 ms for session lookup, 380.6 ms for Kalakriti Audit, and 384.5 ms for global Audit. Almost all time was waiting for the first byte; body transfer was generally under 4 ms. Two cached static-image reads took 132.3 and 132.8 ms through Cloudflare, while alternating health reads remained near 370 ms. These observations suggest substantial shared network/proxy/origin latency, but do not isolate its components. The production audit SELECT means were 0.36 ms for the Kalakriti page, 1.52 ms for its count, 0.12 ms for the global page, 0.55 ms for its count and 2.76 ms for facets. PostgreSQL execution is not the dominant measured HTTP cost, and these figures do not measure Zero's SQLite hydration.

The investigation also reproduced a logging defect: Nitro created its request logger after the handler, and evlog overwrote the supplied duration with elapsed time since logger creation. A 60 ms local handler recorded 1 ms before the fix and 66 ms afterward. The focused regression uses the real logger in an isolated process and verifies response identity, incoming trace identity and skipped routes. The fix creates the logger before awaiting the handler. It needs deployment before request-log durations can support production attribution; no server speedup is claimed from this instrumentation correction.

## Readiness baseline (September 14)

The large Kalakriti benchmark now profiles `kalakritiEdition.readiness` on the overview as global admin. Its initial three analyzer samples were 15.6, 23.9 and 21.5 ms, with 149 unique synced rows. Initial server hydration was 8.4 ms; total hydration was 192.6 ms. These are different measurements, not a production latency comparison.

Analyzer plans varied: the first sample read 179 rows, while the next two read 779. Assignment scans changed from 4 to 1,200; combined Division scans changed from 960 to 90. This is evidence to investigate planner behavior, not evidence that an index or query rewrite will improve the page. No product query or index changed in this milestone.

The fixture has 600 assignments, but only one Volunteer membership has a linked user and therefore only its four assignments satisfy readiness's membership filter. Categories and venues each have one row. The fixture is not go-live-ready and does not prove performance for hundreds of eligible assignments, Edition-admin authorization, or every readiness condition. Further work should cover those scopes before selecting an optimization.

A second isolated run with exact related-table count assertions passed all 13 tests and reproduced the timing pattern (15.3, 24.0 and 21.3 ms). The untimed scope check verifies 10 Centers, one age category, one Competition category, 30 Competitions, 30 Divisions, 30 Sessions, one venue, four assignments and 40 transport assignments. Reports retain counts and diagnostics only. Repository type, lint, unit and unused-export checks and the focused E2E TypeScript check passed.

### Remove unused readiness Competition Divisions

The lifecycle consumer passes the direct `competitionDivisions` list to registration and go-live readiness. Neither function reads nested `competitions.divisions`. Removing only that nested relation reduced reads from 179/779/779 to 149/749/749 and Division scans from 960/90/90 to 30/30/30 across the three analyzer samples. All 149 unique synced rows remain, including the 30 direct Divisions. Assignment planner variation remains.

The changed query measured 14.4, 23.1 and 21.8 ms, versus the verified baseline's 15.3, 24.0 and 21.3 ms. Median time was essentially unchanged; no page speedup is claimed. Server hydration was 7.7 ms and total hydration 179.2 ms in this run, which are single samples rather than acceptance thresholds.

The isolated benchmark and registration lifecycle/cloning regression passed all 14 tests. Type, lint, unit and unused-export checks passed. Root authorization, direct Division syncing, server transition validation and the clone-source query remain unchanged.

## Edition-by-year access baseline (September 14)

The large Kalakriti benchmark profiles `kalakritiEdition.byYear` on the overview as admin and Students as Guardian and liaison. Query selection matches the numeric year, and an untimed analysis verifies exactly one Edition root for each account.

| Account | Median analyzer ms | Read rows | Unique synced rows | Initial server hydration ms | Initial total hydration ms |
|---|---:|---:|---:|---:|---:|
| Admin | 13.0 | 1 | 1 | 0.5 | 213.7 |
| Guardian | 12.8 | 3 | 2 | 1.6 | 571.6 |
| Liaison | 11.4 | 12 | 5 | 1.2 | 513.7 |

All three samples per account had identical read and synced counts. Guardian scanned two memberships and one Edition; liaison additionally scanned nine assignments. These plans show no disproportionate access scan in the 300-membership, 600-assignment fixture, so no query change was made. Total hydration includes other work and is not attributed to these small server execution times. Denied access, archived memberships, many Editions and other assignment responsibilities still need populated performance coverage.

The isolated run passed all 13 tests. Repository type, lint, unit and unused-export checks and focused E2E TypeScript validation passed.

## Student detail Center-query baseline (September 14)

The benchmark searches for the first synthetic Student, opens its real detail sheet, and profiles both Center-wide queries under admin, Guardian and liaison accounts. Each scope verifies exactly 150 Student roots and 300 Entry roots, all belonging to the requested Center. It closes the sheet before continuing navigation.

| Account | Query | Median analyzer ms | Read rows | Unique synced rows | Server hydration ms | Total hydration ms |
|---|---|---:|---:|---:|---:|---:|
| Admin | Student.visibleByCenter | 45.2 | 1,200 | 752 | 58.4 | 338.9 |
| Admin | Entry.visibleByCenter | 133.7 | 3,600 | 994 | 160.9 | 339.1 |
| Guardian | Student.visibleByCenter | 89.4 | 1,955 | 754 | 203.8 | 573.4 |
| Guardian | Entry.visibleByCenter | 186.5 | 5,586 | 996 | 199.0 | 574.0 |
| Liaison | Student.visibleByCenter | 108.8 | 1,956 | 754 | 242.6 | 603.6 |
| Liaison | Entry.visibleByCenter | 185.8 | 5,586 | 996 | 182.9 | 604.0 |

Names above abbreviate the `kalakritiStudent` and `kalakritiEntry` groups. Read and synced counts were identical across each query's three samples. Restricted scopes add authorization work; these results alone do not establish which part can be eliminated safely. Full Center caching is preserved. Initial server and total hydration are single observations and are reported separately from analyzer medians. No query change was made in this milestone.

The isolated browser run passed all 13 tests, including six Center-query scope checks. Repository type, lint, unit and unused-export checks and focused E2E TypeScript validation passed. Denied Centers and other permission responsibilities remain unmeasured here.

### Center Entry detail projection

The only production consumer of `kalakritiEntry.visibleByCenter` is the Student detail sheet. It uses members' Student IDs, participation mode, Division age category, and Competition name/cancellation. The query now shares the existing root authorization/scope builder with the full Entries queries and expands only those detail relationships. `visible`, `byId` and `visibleByDivision` retain their original full projections. No Center Entry root is filtered out, and the main Students/Entries datasets and cache ownership remain unchanged.

| Account | Analyzer median before → after ms | Reads before → after | Unique synced rows before → after |
|---|---:|---:|---:|
| Admin | 133.7 → 47.1 | 3,600 → 1,500 | 994 → 661 |
| Guardian | 186.5 → 98.0 | 5,586 → 3,486 | 996 → 664 |
| Liaison | 185.8 → 99.0 | 5,586 → 3,486 | 996 → 664 |

Each value uses three analyzer samples on the same fixture; counts were stable. Removing unused nested Student operations, category/session/venue and Center hydration accounts for the 2,100-read reduction. The separate Students query is unchanged. After-change server hydration was 102.1/94.6/91.4 ms and total hydration 287.2/415.0/436.1 ms for admin/Guardian/liaison respectively; these single samples do not establish production speed.

All 13 E2E tests passed, checking 300 Center Entry roots and no outside-Center roots for each account, plus the selected Student's two Competition names and Individual labels. Repository type, lint, unit and unused-export checks passed; the independent focused query/scope/component checks passed 32 tests.

### Center Student transport projection

The Student detail sheet consumes `kalakritiStudent.visibleByCenter` only for transport operations. Displayed Student identity and age-category data come from the directory row. This Center query now expands only Edition-scoped transport operations, sharing the unchanged root authorization with the other Student queries. Directory, registration picker and compliance projections retain their original relationships.

| Account | Analyzer median before → after ms | Reads before → after | Unique synced rows before → after |
|---|---:|---:|---:|
| Admin | 45.2 → 24.6 | 1,200 → 450 | 752 → 450 |
| Guardian | 89.4 → 50.6 | 1,955 → 1,205 | 754 → 453 |
| Liaison | 108.8 → 61.3 | 1,956 → 1,206 | 754 → 453 |

Each account retained 150 Student roots and the required transport operations. Removing Entry membership, age-category and Center expansions saved 750 reads per analysis. After-change server hydration was 10.4/184.2/184.5 ms and total hydration 223.5/404.7/382.6 ms respectively. These initial samples differ from analyzer execution and are not evidence of production latency improvement.

All 13 browser tests passed, including exact Center counts, participation labels and the selected Student's `At Event` transport status under three accounts. The existing query projection test was updated to expect transport-only relationships while preserving scope checks. Repository type, lint, unit and unused-export checks passed.

## Competition registration query baseline (September 14)

The large fixture exposes its first Division and Session IDs. The benchmark opens that Division's real registration page as admin, Guardian and liaison. It verifies 1,500/300/300 Student picker roots; 100/20/20 Division Entry roots; and 30 available Divisions for both restricted accounts. Restricted Student and Entry checks also reject roots outside the account's two Centers.

| Account | Query | Median analyzer ms | Reads | Synced rows | Server hydration ms | Total hydration ms |
|---|---|---:|---:|---:|---:|---:|
| Admin | Student.visibleForEntries | 315.4 | 12,000 | 7,511 | 247.7 | 2,646.3 |
| Admin | Entry.visibleByDivision | 71.4 | 1,202 | 416 | 44.1 | 2,196.8 |
| Guardian | Student.visibleForEntries | 88.3 | 3,015 | 1,506 | 221.0 | 546.1 |
| Guardian | Entry.availableDivisionsByCenter | 28.1 | 908 | 97 | 24.0 | 403.8 |
| Guardian | Entry.visibleByDivision | 28.4 | 1,131 | 91 | 20.9 | 400.0 |
| Liaison | Student.visibleForEntries | 102.9 | 3,327 | 1,506 | 237.6 | 565.0 |
| Liaison | Entry.availableDivisionsByCenter | 26.9 | 908 | 97 | 21.4 | 419.6 |
| Liaison | Entry.visibleByDivision | 29.1 | 1,131 | 91 | 24.6 | 415.8 |

Query names abbreviate the `kalakritiStudent` and `kalakritiEntry` groups. Three analyzer samples had stable read/synced counts. Hydration values are single observations of concurrent page loading, not isolated query timing or production measurements.

Admin `availableDivisionsByCenter` has the same AST and result shape as `availableDivisions`. Zero 1.9's React view cache keys by AST hash, result format and client ID; Inspector consequently exposes only the shared available-Divisions view. The benchmark profiles the Center-specific name only for restricted accounts, where the authorization AST differs. The initial timeout waiting for that admin name was a benchmark assumption error, not a page failure.

Consumer inspection identified unused Entry memberships and derived-age-category relationships in the Student picker, and unused category/session/venue relationships in the breadcrumb-specific Division query. These remain candidates requiring measured comparisons; this milestone changes no product query.

The corrected isolated run passed all 13 tests. Type, lint, unused-export and focused E2E TypeScript checks passed. One full unit run spun in Bun's native stack while importing the existing Food-route test; its standalone run passed, the process sample/log were retained, and the identified worker was stopped. A fresh full run passed all ten package tasks in 11.9 seconds. The native-runtime stall's root cause is not established.

### Student registration picker projection

`kalakritiStudent.visibleForEntries` now retains the full authorized Student root set, transport operations, age category and Center. The sole registration-page consumer does not read Entry memberships or the derived-age relationship; eligibility uses the separately loaded Entry query and the assigned age category. Directory and compliance projections retain their prior graphs, and the shared Student authorization predicates are unchanged.

| Account | Analyzer median before → after ms | Reads before → after | Unique synced rows before → after |
|---|---:|---:|---:|
| Admin | 315.4 → 234.0 | 12,000 → 7,500 | 7,511 → 4,511 |
| Guardian | 88.3 → 81.5 | 3,015 → 2,115 | 1,506 → 906 |
| Liaison | 102.9 → 97.2 | 3,327 → 2,427 | 1,506 → 906 |

The same fixture and three samples per scope preserve 1,500/300/300 Student roots and restricted Center boundaries. Admin analyzer time decreased about 26%; restricted timing differences are small and need repeat measurement before a strong latency claim. Read reductions were stable at 4,500/900/900. After-change server hydration was 162.1/195.5/209.9 ms and total hydration 2,481.9/531.8/538.2 ms respectively; no production latency improvement is inferred.

The large benchmark and duplicate-submission regression passed (14 tests including setup; two role-specific tests skipped in the admin project). Type, lint, unit and unused-export checks passed.

The separate volunteer-project run also passed the liaison group Entry create/edit/remove flow (13 tests including setup, two skipped). The existing individual-registration test is marked skipped in source and remains a verification gap; this change does not alter that skip.

### Restore individual-registration verification

The previously `fixme`-disabled liaison individual-registration test passed on the current implementation in three local executions with Playwright retries disabled: 8.0, 8.6 and 7.8 seconds. The first isolated stack reported 13 passing tests including setup; the two-repeat stack reported 14. The flow exercises Student selection in music-enabled and disabled Competitions, multiple individual registration, local music upload/download, removal and resulting audit actions.

The test is enabled again and its stale product-hang comment removed. No combobox product code or retry policy changed. The earlier hang's cause is not established, and these local results do not prove behavior on every CI platform. Type, lint, unit and unused-export checks passed. This closes the skipped local individual-registration verification gap noted above.

## Notification history baseline (September 14)

The app fixture adds 10,000 local-only notifications, split evenly between admin and volunteer, with half archived for each user. Unique future timestamps keep expected fixture results independent of ordinary seed notifications. Each authenticated query must return the exact set of its newest 50 unarchived IDs. The analyzer report returns a match boolean, timings, plans and counts, never notification contents.

Both accounts read and sync 50 rows, but scan 7,500 rows per analysis. SQLite uses `notification_userId_read_idx` to find a user's history and then `USE TEMP B-TREE FOR ORDER BY`. The count is the analyzer's scan metric, not 7,500 distinct notifications. Three-sample analyzer medians were 14.3 ms for admin and 13.3 ms for volunteer. Initial server hydration was 3.6/5.0 ms; total hydration was 216.9/321.7 ms. This establishes unnecessary scan/sort work at this fixture size, not a significant production page delay.

The next candidate is a local experiment with an index matching user, archive filter and ordered creation time (including the query's ID tie-breaker). No schema migration or product change is included in this baseline. The globally mounted inbox and badge share this query. Notification preferences and bulk mark-as-read costs remain unmeasured.

The isolated app benchmark passed all 13 tests, including exact result sets for both users and repeatable seeding. Repository type, lint, unit and unused-export checks and focused E2E TypeScript validation passed.

### Notification ordered-index experiment

Run the app benchmark with `NOTIFICATION_INDEX_EXPERIMENT=true` in addition to `APP_PERFORMANCE=true`. After enforcing the local `pi-dash-test` guard, the seed creates a disposable `notification_perf_history_idx` on `(user_id, archived, created_at DESC, id ASC)`. The report records whether the experiment is enabled, and stack teardown removes the database/index. This is not a production schema migration.

On the same 10,000-row fixture, both accounts' scans decreased from 7,500 to 50 per analysis and the temporary ORDER BY B-tree disappeared. Read/synced counts stayed at 50, and exact expected ID sets passed. Three-sample analyzer medians changed from 14.3 to 12.3 ms for admin and 13.3 to 11.1 ms for volunteer. Server hydration was 1.2/3.5 ms, while total hydration was 217.4/351.4 ms; total hydration did not consistently improve. The benefit established here is bounded scan work and removal of sorting, with a small local analyzer difference.

All 13 benchmark tests passed. A permanent index adds write/storage overhead; the user approved needed performance migrations after this experiment. The candidate does not change the query, ownership rules, newest-50 limit or existing indexes.


## Users and notification preferences baseline (2026-09-14)

The local app fixture now adds 1,000 synthetic users and 11,022 notification preferences across those users and the seeded admin/volunteer. The seed verifies the preference count and creates no credentials for synthetic users. The browser benchmark checks 811 non-external Users and each preference result's exact user and 11-row count.

| Query/account | Median analyzer ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `user.all`, admin | 22.85 | 811 / 811 | 1,824 | 6.79 | 320.5 |
| `notificationPreference.byUser`, admin | 10.51 | 11 / 11 | 11 | 1.24 | 41.2 |
| `notificationPreference.byCurrentUser`, admin | 9.55 | 11 / 11 | 11 | 0.39 | 58.3 |
| `notificationPreference.byCurrentUser`, volunteer | 11.60 | 11 / 11 | 11 | 0.98 | 72.6 |

Preference plans use the existing `(user_id, topic_id)` primary-key index. These measurements do not justify changing those queries. The Users page intentionally caches the full visible directory; its scan metric includes filtering/sorting work and does not represent distinct users.

The benchmark passed all 13 tests with retries disabled. The Bun worker repeatedly spun at the Food route test import, although that test passed alone with the same environment flags. After capturing a native stack sample, the runner now executes that test in its own process; the full unit suite passed in 11 seconds. Type, lint, unused-export and focused benchmark TypeScript checks also passed. The runtime root cause remains unproven. Other permission combinations, denied preference lookups and larger user directories remain unmeasured.


## Scheduled Messages baseline (2026-09-14)

The isolated app fixture adds 500 completed messages and 5,000 sent recipients, with no enqueue or delivery calls. The benchmark verifies all 500 roots and 5,000 related recipients, then opens the scheduling dialog to measure the WhatsApp user picker. Both seeding passes produce identical fixture counts.

| Query | Median analyzer ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `scheduledMessage.all` | 133.66 | 6,000 / 5,502 | 11,500 | 66.66 | 480.2 |
| `user.whatsappUsers` | 16.70 | 400 / 400 | 1,413 | 3.32 | 89.3 |

The message list uses creator names, recipient status summaries and recipient detail rows, so this baseline does not justify removing those relations. Its plan sorts the message root and each recipient lookup with temporary B-trees. Ordered indexes are candidates for a disposable local comparison; no migration is included. The picker scans and sorts Users, but its measured server cost is small at this size.

`scheduledMessage.byId` has no mounted production consumer: the detail sheet selects from the existing list subscription. It remains unmeasured as a query API. The browser benchmark passed all 13 tests without retries. Restricted query API scopes, attachments, mixed delivery statuses and much larger histories still need performance coverage.


## Scheduled Messages ordered-index experiment (2026-09-14)

Run the app benchmark with `SCHEDULED_INDEX_EXPERIMENT=true` alongside `APP_PERFORMANCE=true`. After the local database guard, the seed creates disposable indexes on `scheduled_message (scheduled_at DESC, id ASC)` and `scheduled_message_recipient (scheduled_message_id, id ASC)`. The fixture report records the flag, and stack teardown removes both indexes with the database.

Both temporary sort plans disappeared and scans decreased from 11,500 to 6,000. Reads stayed at 6,000 and synced rows at 5,502; verification retained 500 messages and 5,000 recipients. Three-sample median analyzer time changed from 133.66 to 132.28 ms. Server hydration changed from 66.66 to 75.37 ms and total hydration from 480.2 to 494.0 ms.

This experiment proves less scan/sort work, but no meaningful latency improvement at this fixture size. No permanent index migration is proposed from this result. All 13 browser tests passed with retries disabled. Larger histories may change the tradeoff; these timings do not establish production performance.


## Advance Payment detail baseline (2026-09-14)

The request-detail route mounts both Advance Payment and Reimbursement lookups. The benchmark now visits a populated Advance Payment as admin and owner, then another owner's request as the restricted account. The fixture contains 500 advances, with two line items and two history rows per request.

| Scope | Median analyzer ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin | 13.30 | 8 / 8 | 12 | 0.49 | 513.3 |
| Owner | 10.64 | 8 / 8 | 12 | 1.94 | 230.6 |
| Denied | 8.14 | 0 / 0 | 1 | 0.20 | 214.3 |

Allowed results match the requested ID, two line items and two history rows; the owner result also matches the authenticated user. The accompanying Reimbursement lookup returns zero rows in all three cases. No query change is indicated by these small lookup costs. Attachments and long per-request histories remain unmeasured. All 13 browser tests passed with retries disabled.


## Notification index migration (0088)

The approved schema change generates `notification_userId_archived_createdAt_id_idx` on `(user_id, archived, created_at DESC, id ASC)`. Migration 0088 adds only this index. Its ordering matches the tested disposable candidate and preserves notification ownership, archive filtering and the newest-50 result set. Production deployment remains pending.


The real migration applied successfully in the isolated test stack. Both admin and volunteer plans use `notification_userId_archived_createdAt_id_idx`, with 50 scanned/read/synced rows in all three samples and exact expected IDs. Analyzer medians were 12.83/10.79 ms. All 13 browser tests passed without retries, and type, lint and unused-export checks passed.


## Event expense baseline (2026-09-14)

The app fixture places 200 Reimbursements and 200 Vendor Payments on its public Event, split equally between admin and volunteer. Other financial records remain distributed among the remaining Events. Event summary metrics mount both queries for ordinary volunteers even though the Expenses tab is manager-only; the initial absent-subscription assertion was incorrect and was replaced with ownership checks.

| Query / scope | Median analyzer ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reimbursement / admin | 67.78 | 1,800 / 1,007 | 3,200 | 41.32 | 1,381.7 |
| Vendor Payment / admin | 107.89 | 2,800 / 1,707 | 4,400 | 68.01 | 1,376.2 |
| Reimbursement / owner | 31.23 | 900 / 504 | 1,700 | 18.90 | 305.6 |
| Vendor Payment / owner | 53.86 | 1,400 / 854 | 2,300 | 34.83 | 302.6 |

The benchmark verifies 200 roots per query for admin, 100 for volunteer, and exact volunteer ownership. All 13 tests passed without retries. Both consumers use line-item amounts; the expense list also needs submitter/vendor names. Attachments, history and transaction details are candidates for removing from these Event-specific projections, while full list/detail queries retain them. No query change is included in this baseline.


## Event expense projection improvement (2026-09-14)

Event-specific Reimbursement queries now include line items and submitter; Vendor Payments additionally include vendor names. Neither Event consumer uses attachments, history, categories, linked Event records or transaction details. Full financial list/detail queries keep their existing relationships. Event filtering, permission-dependent ownership and root ordering remain unchanged.

| Query / scope | Analyzer median before → after ms | Reads before → after | Synced before → after | Server hydration after ms | Total hydration after ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reimbursement / admin | 67.78 → 34.83 | 1,800 → 800 | 1,007 → 602 | 14.20 | 1,218.2 |
| Vendor Payment / admin | 107.89 → 37.49 | 2,800 → 1,000 | 1,707 → 702 | 19.13 | 1,215.6 |
| Reimbursement / owner | 31.23 → 20.21 | 900 → 400 | 504 → 301 | 7.22 | 239.5 |
| Vendor Payment / owner | 53.86 → 25.39 | 1,400 → 500 | 854 → 351 | 11.48 | 238.0 |

All 13 browser tests passed with unchanged 200/100 roots, exact owner checks, the displayed ₹2,40,000.00 total, and reimbursement/vendor labels. Focused query tests preserve permission-dependent ownership and full detail relationships. Local results establish reduced query work; production and HTTP latency remain unverified.


## Vendor form lookup baseline (2026-09-14)

The fixture now includes 100 approved synthetic vendors and 100 pending vendors split equally between admin and volunteer. Existing payment fixtures continue to reference approved vendors. The expected approved total comes from the database and includes one ordinary seed vendor; pending results must match the exact 50 owned IDs.

| Query / scope | Analyzer median ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Approved / admin | 13.87 | 101 / 101 | 302 | 1.14 | 361.3 |
| Pending / admin | 11.25 | 50 / 50 | 150 | 0.69 | 361.2 |
| Approved / volunteer | 11.48 | 101 / 101 | 202 | 1.34 | 155.5 |
| Pending / volunteer | 10.13 | 50 / 50 | 150 | 0.63 | 155.4 |

All 13 browser tests passed with retries disabled. These lookup costs do not justify a query/index change at this size. The form opens without submitting a payment or creating a vendor. External-user access and substantially larger vendor populations remain separate coverage gaps.

A production-consumer search also found no mounted uses of financial `byCurrentUser` variants, standalone `vendorPaymentTransaction` variants, or `vendor.byId`. They remain registered and unmeasured as query APIs; they are not additional page-flow bottlenecks. Their existence does not count as measured coverage.


## Banking owner lookup baseline (2026-09-14)

The fixture adds 2,004 synthetic bank accounts, two per fixture user including admin and volunteer. Values are synthetic and no financial operation is submitted. Expected signed-in account counts come from PostgreSQL and include ordinary seed records.

Admin and volunteer each returned three owned rows, with six scans using `bank_account_userId_idx`. Analyzer medians were 11.30/11.01 ms; server hydration was 0.61/0.65 ms and total hydration 37.0/54.3 ms. The remaining temporary sort handles only those three rows. This does not justify another index at the measured size.

All 13 browser tests passed without retries, including exact ownership for both accounts. Large per-user account histories remain unmeasured; the workload exercises a populated table with small personal results.


## Shared lookup baseline (2026-09-14)

The fixture adds 100 expense categories and 200 synthetic WhatsApp groups. Expected counts include ordinary seed rows. The payment form profiles categories for admin and volunteer; the scheduling recipient picker profiles groups for admin without submitting messages.

| Query / scope | Analyzer median ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Categories / admin | 11.76 | 104 / 104 | 208 | 0.92 | 362.4 |
| Categories / volunteer | 11.94 | 104 / 104 | 208 | 1.46 | 182.6 |
| Groups / admin | 14.18 | 201 / 201 | 402 | 1.82 | 99.2 |

All 13 browser tests passed without retries and verified complete lookup counts. The full local lists are intentional; these costs do not justify an index or query change at the tested size. Restricted group readers and external-user denial remain outside this performance measurement.


## Centers assignment baseline (2026-09-14)

The Centers page benchmark now explicitly profiles Guardian and liaison assignment queries against the 300-membership, 600-assignment fixture. Admin receives 300 Guardian links and 300 liaison assignments, each including Centers and memberships.

| Query | Analyzer median ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Guardian assignments | 34.43 | 900 / 460 | 1,200 | 14.38 | 881.1 |
| Liaison assignments | 34.37 | 900 / 460 | 1,500 | 15.82 | 881.0 |

All 13 Kalakriti browser tests passed without retries and both root counts matched exactly. This baseline includes only global-admin access for these queries; linked Edition-admin and volunteer-coordinator memberships are still needed to exercise their restricted authorization branches. The existing Guardian and liaison route regressions do not cover those manager branches. No query change is included.


## Centers restricted-manager baseline (2026-09-14)

The synthetic Edition now links existing memberships 151 and 152 to the seeded Edition-admin and volunteer-coordinator accounts. One existing Competition-volunteer assignment on each becomes its manager responsibility; totals remain 300 memberships and 600 assignments, including 300 liaison assignments. Readiness now sees 12 assignments across three linked volunteer memberships.

| Scope / query | Analyzer median ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Edition admin / liaison | 64.92 | 1,803 / 462 | 2,406 | 55.40 | 353.9 |
| Edition admin / Guardian | 60.61 | 1,803 / 463 | 2,106 | 45.97 | 356.9 |
| Volunteer coordinator / liaison | 59.49 | 1,803 / 462 | 2,406 | 43.09 | 249.7 |

All queries retain the expected 300 roots. The analyzer also includes the manager's authorization assignment in its assignment table, so verification filters liaison rows before counting roots; the reported read/sync/scan metrics remain unfiltered. These manager paths roughly double reads compared with global admin. No authorization or query change is included in this baseline.

All 13 browser tests passed without retries, including existing Guardian/liaison regressions. The coordinator's denied Guardian-assignment query is not mounted by this UI and remains an API-level coverage gap. Other manager-role roster and directory queries still need populated measurements.


## Kalakriti membership and age-category lookups (2026-09-14)

The populated Students-page benchmark now profiles sidebar membership and reference-Center age categories for global admin, Guardian and liaison. Admin has no membership; Guardian has one membership without assignments; liaison has one membership and four assignments. Each scope returns one allowed age category.

| Scope / query | Analyzer median ms | Read / synced | Scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin / membership | 10.24 | 0 / 0 | 0 | 0.53 | 110.6 |
| Guardian / membership | 10.57 | 1 / 1 | 1 | 0.60 | 143.6 |
| Liaison / membership | 9.48 | 5 / 5 | 9 | 0.49 | 141.6 |
| Admin / age categories | 11.66 | 1 / 1 | 2 | 0.27 | 859.9 |
| Guardian / age categories | 10.79 | 8 / 4 | 9 | 7.75 | 141.3 |
| Liaison / age categories | 11.92 | 8 / 4 | 16 | 6.44 | 139.0 |

All 13 browser tests passed without retries, with exact membership/assignment and age-category counts. No query change is indicated. The age-category fixture has one category, so this measures permission-path overhead amid populated related tables, not a large category catalog. An unreachable duplicate Centers benchmark block was also removed from the Students/Entries/Food-only loop.


## Edition-admin full-roster baseline (2026-09-14)

The same fixture now measures Students, Entries and Food with an Edition-admin assignment and no global-admin shortcut. All root counts match global admin: 1,500 Students, 3,000 Entries and 300 Food memberships.

| Query | Global / Edition-admin analyzer median ms | Edition-admin read / synced | Edition-admin scans | Server hydration ms | Total hydration ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Students directory | 313.67 / 653.75 | 14,129 / 7,514 | 28,428 | 503.89 | 1,001.9 |
| Entries | 1,171.49 / 1,763.22 | 58,340 / 9,108 | 77,248 | 1,467.55 | 3,022.1 |
| Food Students | 487.23 / 1,106.44 | 25,541 / 6,015 | 42,675 | 620.85 | 4,528.4 |
| Food memberships | 138.11 / 777.47 | 31,684 / 912 | 42,692 | 756.32 | 4,163.1 |

All 13 browser tests passed without retries. These scoped authorization paths warrant further investigation. In the same run, the global-admin Students sample scanned 4,506,000 entry-member rows through repeated full scans for `(student_id, edition_id)` ordered by ID, despite an existing student-only index; the later Edition-admin plan used that index. This plan difference needs a controlled comparison before adding a migration or claiming a fix.


## Entry-member ordering index experiment (2026-09-14)

Set `ENTRY_MEMBER_INDEX_EXPERIMENT=true` with the Kalakriti benchmark to create a disposable `(student_id, edition_id, id)` index after the local database guard. The fixture report records the option and teardown removes the index with the database.

The baseline global-admin Students samples took 598.99, 306.65 and 313.67 ms. Only the first performed 4,506,000 entry-member scans; subsequent samples used the existing student-only index and scanned 6,000 rows. The compound-index samples took 317.30, 304.59 and 308.26 ms, each scanning 3,000 entry-member rows without a temporary sort. Reads/synced rows stayed at 12,000/7,511. Initial server hydration changed from 564.19 to 293.24 ms and total hydration from 992.4 to 735.4 ms in this comparison.

Guardian, liaison and Edition-admin results also retained their read/synced counts. Their entry-member scans were 600, 600 and 3,000 respectively. Edition-admin median analyzer time was essentially unchanged at 654.78 ms versus 653.75 ms. The demonstrated benefit is avoiding the expensive initial plan and sorting; this is not a broad warm-query latency improvement.

All 13 browser tests passed without retries. The user has approved needed performance migrations; this experiment supports generating the compound index while preserving the existing index and authorization predicates. Production effects remain unverified.

### Generated migration verification

Migration `0089_bouncy_mandarin.sql` adds the canonical `kalakriti_entry_member_studentId_editionId_id_idx` index. A fresh local run applied the migration with the experiment disabled and passed all 13 browser tests without retries. All three global-admin directory plans used the canonical index, scanned 3,000 entry-member rows and retained 12,000 reads / 7,511 synced rows. Analyzer samples were 326.65, 307.85 and 304.97 ms. The existing index is retained; production application and effects remain unverified.

## Food Center expansion authorization (2026-09-14)

Food memberships previously evaluated `foodCenter` both in each included assignment/Guardian link's `whereExists("center")` and again in its related Center expansion. The parent existence predicate already authorizes that same Center. Keep that predicate and expand the admitted link's Center directly; root authorization and included link filtering remain unchanged.

The same migration-backed fixture, navigation and accounts produced these local membership-query results (three analyzer samples per account):

| Account | Median before → after | Reads before → after | Synced rows |
| --- | --- | --- | --- |
| Global admin | 137.19 → 145.62 ms | 11,201 → 11,201 | 911 |
| Guardian | 138.10 → 127.31 ms | 6,862 → 6,022 | 213 |
| Liaison | 146.52 → 131.42 ms | 6,875 → 6,031 | 213 |
| Edition admin | 773.85 → 637.47 ms | 31,684 → 24,724 | 912 |

Edition-admin initial server hydration was 757.77 → 590.64 ms; total hydration was 4,186.3 → 3,910 ms. These are separate from analyzer timings and do not establish production improvement. All 13 benchmark browser tests passed without retries, followed by all four Food/Entry release-invariant cases and their 12 authentication setups. Focused scope tests include revoking Guardian Center authority and verifying that included assignment and Guardian links disappear. Permission predicates still run in Zero so authority changes remain reactive.

### Live permission revocation verification

Two additional release-invariant cases keep Food mounted as a Guardian and liaison. Removing the actor's Center B link through the fixture database removes the Center B-only Guardian row and narrows a retained Guardian's nested Centers to Center A. Both cases assert zero document navigation requests and no outside-Center name in incoming Zero frames. Both passed without retries (14 tests including authentication setup). These checks prove the tested Guardian-link and liaison-assignment changes propagate to an open local roster; they do not cover every role or authorization mutation.

## Edition configuration baseline (2026-09-14)

The overview mounts the current Edition's `cloneSource` and the accessible configuration list even without opening the clone dialog. Profile those existing subscriptions without cloning or modifying an Edition. Global admin's configuration-list AST matches `accessible`; only the distinct Edition-admin configuration-list query is counted here.

| Query / account | Median analyzer | Read / synced | Scans | Server hydration | Total hydration |
| --- | --- | --- | --- | --- | --- |
| Clone source / global admin | 13.46 ms | 64 / 64 | 94 | 2.40 ms | 82.5 ms |
| Clone source / Edition admin | 11.74 ms | 69 / 66 | 102 | 2.16 ms | 248.1 ms |
| Configuration list / Edition admin | 10.62 ms | 13 / 6 | 19 | 1.06 ms | 248.2 ms |

Untimed verification confirms the exact source Edition and all 30 Competitions, 30 Divisions, one age category, one competition category and one venue for both accounts. The configuration-list check confirms the synthetic Edition is present; it does not independently verify every other Edition in the seeded account's list. All 13 browser tests passed without retries. This workload does not establish a configuration-query bottleneck, so these queries remain unchanged. Larger multi-Edition histories and additional permission scopes remain unmeasured.

## Edition picker and Eligibility baseline (2026-09-14)

The authenticated benchmark now measures the mounted Edition picker for four accounts and the Eligibility page for both admin scopes. Each picker check confirms the synthetic Edition is present, not the complete authorization of all other seeded Editions. This dataset has three Editions; it is a large roster workload, not a large historical Edition list.

| Query / account | Median analyzer | Read / synced | Scans | Server hydration | Total hydration |
| --- | --- | --- | --- | --- | --- |
| Picker / global admin | 11.72 ms | 3 / 3 | 6 | 0.90 ms | 86.3 ms |
| Picker / Guardian | 10.91 ms | 11 / 5 | 14 | 5.59 ms | 541.6 ms |
| Picker / liaison | 11.12 ms | 19 / 8 | 22 | 6.17 ms | 586.8 ms |
| Picker / Edition admin | 11.27 ms | 19 / 8 | 22 | 7.21 ms | 177.1 ms |
| Eligibility / global admin | 12.56 ms | 1 / 1 | 2 | 0.41 ms | 92.8 ms |
| Eligibility / Edition admin | 11.38 ms | 15 / 4 | 1,231 | 154.96 ms | 334.1 ms |

All 13 browser tests passed without retries. Eligibility verifies one age-category root under both accounts. The Edition-admin plan performs a full assignment scan for `(competition_category_id, responsibility)`, with 1,219 assignment visits in every sample. This is a candidate for a controlled index experiment, especially under the category-lead branch; the current 11 ms analyzer median does not establish a material page-delay cause. The initial server hydration is a separate sample and is not attributed solely to that scan. No product query changed in this milestone.

Remaining consumer inspection confirms that `eventPhoto.byEvent`, `eventUpdate.byEvent`, `teamEvent.byCurrentUser`, `teamEvent.byIdWithExpenses` and `teamEvent.public` have no production consumers. They remain unmeasured registered APIs. The next active page gaps include `/teams`, team detail, event-detail interests and album metadata.
