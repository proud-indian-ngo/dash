# Query performance audit coverage

Status: incomplete. Inventory checked against `packages/zero/src/queries.ts` and its query definitions on 2026-09-14. There are 32 registered groups and 88 named query variants. The authenticated large-fixture reports cover 38 distinct variants; coverage below means measured under at least one account, not proven fast for every permission scope or dataset.

Evidence: `packages/e2e/tests/performance/kalakriti.spec.ts` and `packages/e2e/tests/performance/app.spec.ts`, with their JSON report attachments. Commands, fixture sizes, account scopes, timings and limitations are recorded in [E2E architecture](architecture/e2e-testing.md). SQLite reads, synced rows, server hydration and total hydration are separate measurements. Broad local caching is intentional; root scans and row counts alone do not establish waste.

## Zero variants

| Group | Large-fixture measurement exists | No large-fixture measurement yet |
|---|---|---|
| `advancePayment` | `all` | `byCurrentUser`, `byId` |
| `appConfig` | None | `all` |
| `bankAccount` | None | `bankAccountsByCurrentUser` |
| `eventFeedback` | `byEvent` | None |
| `eventImmichAlbum` | None | `byEvent` |
| `eventInterest` | `allPending`, `byCurrentUser` | `managerByEvent`, `myByEvent` |
| `eventPhoto` | `allPending`, `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` | `byEvent` |
| `eventUpdate` | `allPending`, `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` | `byEvent` |
| `expenseCategory` | None | `all` |
| `kalakritiAssignment` | `roster` | `myAccess` |
| `kalakritiCenter` | `visible` | `guardianAssignments`, `liaisonAssignments` |
| `kalakritiCompetition` | `categories`, `competitions`, `sessions`, `venues` | None |
| `kalakritiEdition` | `readiness` (global admin) | `accessible`, `byTeamEventId`, `byYear`, `cloneSource`, `configurationAccessible` |
| `kalakritiEligibility` | None | `ageCategories` |
| `kalakritiEntry` | `availableDivisions`, `visible` | `availableDivisionsByCenter`, `visibleByCenter`, `visibleByDivision`, `byId` |
| `kalakritiFood` | `students`, `memberships` | None |
| `kalakritiGuardian` | `roster` | None |
| `kalakritiStudent` | `visibleForCompliance`, `visibleForDirectory` | `ageCategoriesByCenter`, `visibleForEntries`, `visibleByCenter` |
| `kalakritiCenterScan` | `byCenter` | None |
| `kalakritiAttendee` | `visible` (admin Guest and Judge) | None |
| `kalakritiTransport` | `byCenter` | None |
| `notification` | None | `forCurrentUser` |
| `notificationPreference` | None | `byCurrentUser`, `byUser` |
| `reimbursement` | `all`, `byId` | `byCurrentUser`, `byEvent` |
| `scheduledMessage` | None | `all`, `byId` |
| `team` | `byCurrentUser` | `all`, `byId` |
| `teamEvent` | `allAccessible`, `byCurrentUserAll`, `byId` | `byCurrentUser`, `byIdWithExpenses`, `byTeam`, `public` |
| `user` | None | `all`, `one`, `whatsappUsers` |
| `vendor` | `all` | `approved`, `byId`, `pendingByCurrentUser` |
| `vendorPayment` | `all`, `byId` | `byCurrentUser`, `byEvent` |
| `vendorPaymentTransaction` | None | `byId`, `byVendorPayment` |
| `whatsappGroup` | None | `all` |

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
