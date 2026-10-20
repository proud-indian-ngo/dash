# Query performance audit

Evidence for measured query and browser performance changes, including rejected approaches. Benchmark commands, fixtures and flags are in [E2E testing](architecture/e2e-testing.md#performance-benchmarks); implementation rules are in `.agents/skills/query-performance/SKILL.md`.

Most numbers below come from the synthetic local fixtures on 14–15 Sept 2026 (Zero 1.9, PostgreSQL 18.3, optimized build). "Analyzer" means the median of three Zero analyzer samples. Local results show query work, not production latency.

## Query coverage

Zero queries were inventoried against `packages/zero/src/queries.ts` on 14 Sept 2026: 32 groups and 88 variants, of which 74 were measured under at least one account. Measured means profiled on the large fixture, not proven fast for every role or dataset.

| Group | Measured (accounts) | Not measured |
|---|---|---|
| `advancePayment` | `all`, `byId` (admin, owner, denied) | `byCurrentUser`* |
| `appConfig` | `all` (admin) | |
| `bankAccount` | `bankAccountsByCurrentUser` (admin, volunteer) | |
| `eventFeedback` | `byEvent` (admin) | |
| `eventImmichAlbum` | `byEvent` (admin, volunteer) | |
| `eventInterest` | `allPending`, `byCurrentUser`, `managerByEvent`, `myByEvent` (admin, Team lead) | |
| `eventPhoto`, `eventUpdate` | `allPending`, `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` (admin, volunteer) | `byEvent`* |
| `expenseCategory` | `all` (admin, volunteer) | |
| `kalakritiAssignment` | `roster`, `myAccess` (admin, Guardian, liaison) | |
| `kalakritiAttendee` | `visible` for Guests and Judges (admin) | Restricted Judge visibility |
| `kalakritiCenter` | `visible`, `guardianAssignments`, `liaisonAssignments` (admin, Edition admin, coordinator) | |
| `kalakritiCenterScan`, `kalakritiTransport` | `byCenter` (admin, Guardian, liaison) | |
| `kalakritiCompetition` | `categories`, `competitions`, `sessions`, `venues` (admin) | |
| `kalakritiEdition` | `readiness`, `byYear`, `cloneSource`, `configurationAccessible`, `accessible`, `byTeamEventId` (admin and restricted roles) | |
| `kalakritiEligibility` | `ageCategories` (admin, Edition admin, category lead, overall-events) | |
| `kalakritiEntry` | `visible`, `visibleByCenter`, `visibleByDivision`, `availableDivisions`, `availableDivisionsByCenter` (admin, Guardian, liaison; `visible` also Edition admin, category lead, overall-events lead) | `byId`* |
| `kalakritiFood` | `students`, `memberships` (admin, Edition admin, Guardian, liaison) | |
| `kalakritiGuardian` | `roster` (admin) | |
| `kalakritiStudent` | `visibleForCompliance`, `visibleForDirectory`, `visibleByCenter`, `visibleForEntries`, `ageCategoriesByCenter` (admin, Guardian, liaison; directory also Edition admin) | |
| `notification` | `forCurrentUser` (admin, volunteer) | |
| `notificationPreference` | `byCurrentUser`, `byUser` (admin, volunteer) | |
| `reimbursement`, `vendorPayment` | `all`, `byId`, `byEvent` (admin, owner, denied) | `byCurrentUser`* |
| `scheduledMessage` | `all` (admin) | `byId`* |
| `team` | `all`, `byCurrentUser`, `byId` (admin, non-member) | |
| `teamEvent` | `allAccessible`, `byCurrentUserAll`, `byId`, `byTeam` (admin, volunteer, Team lead) | `byCurrentUser`*, `byIdWithExpenses`*, `public`* |
| `user` | `all`, `whatsappUsers` (admin) | `one`* |
| `vendor` | `all`, `approved`, `pendingByCurrentUser` (admin, volunteer) | `byId`* |
| `vendorPaymentTransaction` | | `byId`*, `byVendorPayment`* |
| `whatsappGroup` | `all` (admin) | |
| Added after Sept 2026 | | `accountHead`, `contribution`, `contributionReceipt`, `costCentre`, `fiscalYear`, `fund`, `gatewaySettlement`, `importBatch`, `kalakritiInventory`, `ledger`, `orgAccount`, `otherIncome`, `party`, `programme`, `project`, `socialPost`, `socialRun`, `statementLine` |

\* No production consumer in `apps/` or `packages/` at the time of the audit. These are registered APIs, not page bottlenecks.

Server reads and CPU work:

| Surface | Profiled by | Status |
|---|---|---|
| Global Audit Log (`/api/audit-log`: page, count, facets) | `tests/performance/audit.spec.ts`, 50,000 rows | Profiled; first and deep pages indexed |
| Kalakriti Audit (`/api/kalakriti/:year/audit`) | `tests/performance/kalakriti-audit.spec.ts`, 41,000 rows | Profiled; first page indexed |
| Kalakriti dashboard aggregates | `helpers/profile-kalakriti-dashboard.ts` | Profiled; 19–113 ms per scope, no bottleneck |
| Entry eligibility (session page, registration picker) | `apps/web/scripts/profile-entry-eligibility.ts` | Profiled; fixed (see below) |
| Jobs list, count and queue stats | none | Not profiled |
| Analytics client aggregation and charts | none | Reuses measured queries; rendering not profiled |

## Proven changes

The retained changes preserve results, permissions and cache behaviour on the measured fixtures.

### Indexes

| Index (migration) | Access path | Evidence |
|---|---|---|
| `kalakriti_assignment_membershipId_editionId_id_idx` (0084) | Food membership → assignments | Assignment visits 180,300 → 600; Food memberships 173 → 148 ms. `ANALYZE` alone did not produce this plan |
| `kalakriti_assignment_center_responsibility_idx`, `kalakriti_assignment_competition_responsibility_idx` (0085) | Scoped Center and Competition authorization | Scans 24,846 → 906 (Entries) and 20,072 → 1,864 (Food); no latency change. Kept for growth in assignments |
| `audit_log_attempted_at_id_idx` (0086) | Audit Log ordering | First page 14 → 0.03 ms SQL; offset 40,000 29 → 5 ms with no sort spill. Must be `DESC NULLS FIRST` to match the query; Drizzle's default `NULLS LAST` left the sort in place |
| `kalakriti_audit_edition_created_id_idx` (0087) | Kalakriti Audit first page | Item SQL 21 → 0.04 ms; HTTP 24 → 16 ms for admins. Deep offsets and counts unchanged |
| `notification_userId_archived_createdAt_id_idx` (0088) | Inbox newest 50 | Scans 7,500 → 50, temp sort removed |
| `kalakriti_entry_member_studentId_editionId_id_idx` (0089) | Students directory entry members | Stops an occasional first-sample plan that scanned 4.5 million rows |
| `kalakriti_assignment_category_responsibility_idx` (0090) | Category authority in Eligibility | Assignment visits 1,219 → 8 |
| `kalakriti_operation_student_edition_type_id_idx` (0091) | Entries member operations | Operation scans down 80%, temp sort removed; timing flat |
| `kalakriti_competition_entry_edition_created_id_idx` (0092) | Entries root ordering | Entry scans 6,000 → 3,000, no root sort |
| 0094 drops 11 redundant indexes | Each covered by a wider unique or ordered index | 448 KiB saved in production; all tested query results and 744 constraints unchanged |

0094 drops indexes in the Drizzle runner's single transaction, so it takes table locks until commit. Deploy such migrations in a quiet window; `DROP INDEX CONCURRENTLY` does not work with that runner.

### Projections and patterns

| Change | Effect |
|---|---|
| Food memberships: admin permission shortcut | Reads 9,902 → 5,401, same synced rows |
| Food memberships: expand an admitted link's Center directly instead of re-checking `foodCenter` | Edition admin 774 → 637 ms, reads 31,684 → 24,724. Live revocation still removes rows from an open page |
| Entries: drop unused `members.student.center` | Reads 39,000 → 36,000; 1,332 → 1,202 ms |
| `kalakritiEntry.visibleByCenter` (Student detail): detail-only projection on the shared scope | Admin 134 → 47 ms, reads 3,600 → 1,500 |
| `kalakritiStudent.visibleByCenter`: transport operations only | Admin 45 → 25 ms, reads 1,200 → 450 |
| `kalakritiStudent.visibleForEntries` (registration picker): drop Entry memberships and derived age | Admin 315 → 234 ms, reads 12,000 → 7,500 |
| Readiness: drop nested `competitions.divisions`, use the direct Division list | Division scans 960 → 30 |
| Event expense queries: line items, submitter and vendor name only | Vendor payments (admin) 108 → 37 ms, reads 2,800 → 1,000 |
| `eventInterest.byCurrentUser`: skip the Event-existence predicate for `events.view_all` | 84 → 42 ms, reads halved. The non-null foreign key guarantees the Event exists |
| Event detail: mount `eventFeedback.byEvent` only for feedback managers | Volunteers no longer run a 202-read query that returned nothing |
| Team route: remove the unconditional `teamEvent.byTeam` preload | Denied Team no longer syncs 903 rows; authorized navigation unchanged |
| Entry eligibility: build an Entry-by-Student map once per calculation | 1,500 Students: 59 → 0.6 ms CPU |
| Audit Log facets: one `GROUPING SETS` query instead of two `DISTINCT` queries | Rows scanned 100,002 → 50,001 |
| Server tables: reset pagination when the debounced search commits | One request per search from page two instead of two |
| Request logger created before the handler | Request-log durations were wrong (60 ms logged as 1 ms); instrumentation fix only |

### Idle route code warming

With a ready dashboard and the same 10-second quiet period, three local production-build runs per role/device compared first navigation before and after code warming. Chrome used 4× CPU slowdown, 1.6 Mbps download and 150 ms latency. Medians include browser-test readiness overhead.

| Mobile first visit | Before | After |
|---|---:|---:|
| Admin Events | 997 ms | 232 ms |
| Admin Claims | 1,647 ms | 347 ms |
| Volunteer Events | 795 ms | 283 ms |
| Volunteer Claims | 1,497 ms | 246 ms |

About 159 KB of additional compressed JavaScript loaded before navigation. Users did not improve consistently within that idle window. That comparison changed code timing only. Scheduling rules live in [route preloads](architecture/data-layer.md#route-preloads).

Immediate navigation remained mixed in a fresh control: desktop admin Events' median rose from 748 to 1,078 ms, with overlapping sample ranges of 741–1,098 and 715–1,097 ms. Three samples and readiness polling do not establish zero overhead. Both comparisons completed without browser errors.

### Normal-use responsiveness

Matched local production benchmarks used the same throttling above, three samples and standard seeded records. These medians include test readiness overhead, not field percentiles or production-scale workload validation.

| Path | Before | After |
|---|---:|---:|
| Repeat Users, desktop | 448 ms | 264 ms |
| Repeat Users, mobile | 498 ms | 284 ms |
| First claim, desktop with 500 ms hover | 1,566 ms | 1,047 ms |
| First claim, immediate desktop click | 1,596 ms | 1,578 ms |
| First claim, mobile tap | 1,495 ms | 1,486 ms |

Users reuse their session's private list and role options while refreshing. First visits remained around 1.1–1.2 seconds. The repeat-click Event Timing median increased from 72 to 232 ms on desktop and 96 to 232 ms on mobile: cached rows arrive sooner, but table mounting moves into the initial interaction. Cache ownership and invalidation live in [caching](architecture/caching.md).

Claim hover moves downloading ahead of the click; its 500 ms lead-in is excluded from the table. An immediate pointerdown cancels the pending hover timer, avoiding a second preload during navigation. Keyboard activation and the charge editor remained usable.

A separate same-build comparison gave each finance destination a fresh context:

| First visit | Immediate navigation | After 20 seconds idle |
|---|---:|---:|
| Income, desktop | 4,282 ms | 1,813 ms |
| Income, mobile | 3,198 ms | 748 ms |
| Books, desktop | 2,000 ms | 631 ms |
| Books, mobile | 1,984 ms | 602 ms |

The longer idle window loaded about 298 KB of extra compressed JavaScript before navigation; neither destination then needed post-click JavaScript. At ten seconds the queue was incomplete. Repeat visits changed little. This supports bounded code warming, not warming every database query.

Contribution-dialog traces isolated about 245 ms to mounted controls on first open and 101 ms on repeat. Reduced motion measured 296 and 102 ms, so shortening animation does not address mounting. Base UI drawer geometry reads dominated style/layout work; form code accounted for about 20 ms initially. No local optimization was adopted: changing the mobile drawer interaction or memoizing the form would not be justified by that profile. The opt-in profiler retains in-page readiness marks and timelines for evaluating a dependency-level fix.

### Loading geometry

Three fresh contexts per case used the same throttling and production harness. These are local seeded mobile CLS medians:

| Page | Before | Retained change |
|---|---:|---:|
| Food, no eligible people | 0.321 | 0.007 |
| Food, populated eligible roster | 0.150 | 0.007 |
| Trust deed | 0.581 | 0.000 |
| Governance documents | 0.143 | 0.058 |
| Declarations | 0.303 | 0.000 |

Food reserves its loading geometry; Deed uses the rules/history layout while loading. Documents resolves signing-service status before rendering its warning. Declarations waits for the personal and board data instead of inserting the personal card above a rendered table. That completeness requirement increased measured mobile readiness from 5.45 to 6.00 seconds under throttling.

Two trials were rejected. Splitting the claim editor saved about 35 KB of detail JavaScript, but mobile detail readiness stayed near 1.56 seconds and first edit rose from 511 to 900 ms. Caching table width reduced mobile repeat Users navigation from 269 to 242 ms, but desktop rose from 240 to 288 ms and first visits slowed. Neither trial justified its extra complexity. The opt-in probes remain available; early Event Timing snapshots are diagnostics, not INP.

### Warm governance navigation

Three fresh contexts per destination and viewport used real dashboard links, a two-second dashboard settle, enabled caches and the same throttling. Each first/repeat pair stayed in one document. Baseline medians in milliseconds:

| Page | Desktop first / repeat | Mobile first / repeat |
|---|---:|---:|
| Register | 2,405 / 278 | 2,350 / 324 |
| Documents | 1,879 / 212 | 1,814 / 298 |
| Deed | 1,163 / 163 | 1,195 / 226 |
| Resolutions | 2,064 / 260 | 1,931 / 332 |
| Meetings | 1,181 / 143 | 1,181 / 216 |
| Compliance | 1,271 / 145 | 1,282 / 326 |
| Declarations | 1,698 / 215 | 1,648 / 282 |
| Policies | 1,163 / 145 | 1,164 / 216 |
| Registrations | 1,802 / 145 | 1,772 / 232 |

All 54 samples reached their readiness marker without page errors. First visits downloaded 46–153 KB of compressed route JavaScript; repeats downloaded none. Compliance had one 626 ms mobile repeat, without a corresponding long-task increase. These are seeded lab timings, not field percentiles. Meetings verifies the populated Past tab count; Registrations has no seeded row.

Documents' signing-status request revalidates in the router's background on repeat visits. Its loader remains blocking on first entry to preserve warning geometry; an extra status cache has no demonstrated navigation benefit.

The register preloads deed versions alongside trustees because both gate its loading state. Two candidate runs reduced mobile first-visit medians from 2,350 to 2,249 and 2,214 ms; desktop measured 2,364 and 2,316 ms against 2,405. Repeat timing varied.

Deferring the trustee form alongside its private requests saves 4.7 KB. Against a repeated control, desktop/mobile navigation improved 2,456/2,248 → 2,295/2,182 ms; Add trustee measured 350/331 → 364/332 ms, within observed variation. Independent fresh-context actions prevent warmed forms from masking regressions.

Deferring period forms as well saved 27 KB but slowed mobile Add trustee from 363 to 947 ms, so that trial was rejected. The shared form library stays eager.

### Rules these results support

- Global admins skip most permission predicates. Measure the restricted role too: Edition admin roughly doubles the reads of global admin on Students, Entries and Food.
- A lower scan count is less work, not a faster page. Several indexes cut scans by 80–97% with no timing change; accept them only when growth or plan stability justifies the write cost.
- Root scans on unbounded admin lists are expected. Small lookup tables (categories, groups, preferences, banking) cost 10–15 ms and need no index.
- Check the plan of every sample. SQLite chose a 4.5-million-row scan once and the index on later samples.
- When narrowing a projection, compare fresh and warm navigation as well as analyzer time (see the rejected `teamEvent.byId` change below).

## Rejected approaches

These alternatives did not justify their cost or regressed user-visible performance.

| Approach | Why rejected |
|---|---|
| Audit facets via sorted `array_agg(DISTINCT …)` | Sorted every row; about 70 ms vs 14 ms for `GROUPING SETS` |
| Audit deep pages via an ID-only subquery | Sort still spilled; no consistent HTTP gain. The ordered index fixed it instead |
| Audit search with `count(*) over()` | Broad search 35 → 58 ms and past-end offset 143 → 282 ms |
| Scheduled Messages ordering indexes | Removed temp sorts but no timing change (134 → 132 ms) |
| Entry member `(entry_id, edition_id, id)` index | Fewer scans for individual and ten-member group Entries, no timing gain; flag kept as an experiment |
| Factor category-lead and coordinator checks under one Division → Competition traversal | Saved 60 reads (under 0.5%), no timing gain |
| Drop the nested interest expansion from `teamEvent.byId` | Query reads 1,609 → 7, but time to a usable 801-interest queue got worse (cold 940 → 1,328 ms, warm 673 → 793 ms) |
| Another permission shortcut or speculative index for admin Entries | The admin shortcut already exists and the analyzer shows no alternative join plan; the cost is the relationship graph |

## Production observations

- 14 Sept 2026: `pg_stat_statements` enabled after PR 128. Production audit SELECTs averaged 0.1–2.8 ms, while HTTP took about 370–385 ms on every route including `/api/health`, almost all waiting for the first byte. PostgreSQL is not the main HTTP cost; the network, proxy or origin is, but the split is not isolated.
- The read-only `pgbot` snapshot showed no replication lag, no blocked sessions and a 100% cache hit rate in a short sample. Zero's CVR `rows` table was 65 of 105 MiB. Its unindexed-foreign-key and overlapping-index findings are candidates, not a migration list; 0094 handled the overlaps with no recorded use.
- `pg_stat_statements` does not measure Zero's SQLite hydration.

## Remaining work

- Profile the query groups added after Sept 2026 (finance, ledger, parties, social, inventory) with populated fixtures.
- Entries is the largest Zero workload: about 1.2 s and 36,000 reads for 3,000 Entries as admin, 1.7–1.8 s for Edition admin and overall-events lead. Investigate its permission and relationship graph; further indexes have not helped.
- Edition-admin Food Students (about 1.1 s), Food memberships (about 640 ms) and Students directory (about 650 ms) remain expensive.
- Jobs page: needs a populated workload and plans.
- Kalakriti Audit deep offsets and counts still scan and sort.
- Audit Log substring search (about 150 ms HTTP on 50,000 rows) needs its own approach that keeps case-insensitive matching across all five fields.
- Unmeasured scopes: restricted Judge visibility, Team member and lead scopes beyond the one queue, denied preference lookups, the coordinator's denied Guardian-assignment query, attachment-heavy requests, recurring Event exceptions, long per-request histories, many Teams, many Editions, large category catalogs.
- Live Kalakriti mutations, camera scanning and finalized scan-stage history.
- 11 overlapping production indexes with recorded use still need workload comparisons.
- Production: correlate a real navigation window with `pg_stat_statements` and `track_io_timing`, and measure Zero replica storage and CPU.
