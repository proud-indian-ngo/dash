# Query performance audit coverage

Status: incomplete. Inventory checked against `packages/zero/src/queries.ts` and its query definitions on 2026-09-14. There are 32 registered groups and 88 named query variants. The authenticated large-fixture reports cover 32 distinct variants; coverage below means measured under at least one account, not proven fast for every permission scope or dataset.

Evidence: `packages/e2e/tests/performance/kalakriti.spec.ts` and `packages/e2e/tests/performance/app.spec.ts`, with their JSON report attachments. Commands, fixture sizes, account scopes, timings and limitations are recorded in [E2E architecture](architecture/e2e-testing.md). SQLite reads, synced rows, server hydration and total hydration are separate measurements. Broad local caching is intentional; root scans and row counts alone do not establish waste.

## Zero variants

| Group | Large-fixture measurement exists | No large-fixture measurement yet |
|---|---|---|
| `advancePayment` | `all` | `byCurrentUser`, `byId` |
| `appConfig` | None | `all` |
| `bankAccount` | None | `bankAccountsByCurrentUser` |
| `eventFeedback` | `byEvent` | None |
| `eventImmichAlbum` | None | `byEvent` |
| `eventInterest` | None | `allPending`, `byCurrentUser`, `managerByEvent`, `myByEvent` |
| `eventPhoto` | `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` | `allPending`, `byEvent` |
| `eventUpdate` | `approvedByEvent`, `myPendingByEvent`, `pendingByEvent` | `allPending`, `byEvent` |
| `expenseCategory` | None | `all` |
| `kalakritiAssignment` | `roster` | `myAccess` |
| `kalakritiCenter` | `visible` | `guardianAssignments`, `liaisonAssignments` |
| `kalakritiCompetition` | `categories`, `competitions`, `sessions`, `venues` | None |
| `kalakritiEdition` | None | `accessible`, `byTeamEventId`, `byYear`, `cloneSource`, `configurationAccessible`, `readiness` |
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
| `team` | None | `all`, `byCurrentUser`, `byId` |
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
- Jobs, global Audit Log and Kalakriti Audit use server/HTTP reads and need populated workloads, database plans and end-to-end timings. They are not represented by the Zero registry table.
- Production disk latency, CPU contention, replication lag and CVR behavior remain a separate investigation. Local benchmarks cannot establish their health.

## Proven changes and current priority

Food's admin permission shortcut reduced local analyzer time and relationship reads while preserving results. Assignment indexes reduce repeated membership and scoped authorization scans; the two scoped indexes did not materially improve local latency. Bounded route preload ownership and intent preloading address speculative navigation work. The request detail loading fix prevents a premature empty state while either lookup remains pending.

Entries is the largest measured hydration workload: approximately 1.2 seconds in the analyzer, 36,000 reads and 9,103 unique synced rows for 3,000 Entries. Removing the unused nested member Student Center relation reduced reads from 39,000 and median analyzer time from 1,332 ms to 1,202 ms on the same fixture. The Entry Center and separate Student picker Center labels remain available. Further graph changes require consumer evidence; preserve full local datasets, permission boundaries, filters and detail behavior. Continue through the unmeasured variants and HTTP surfaces above, recording representative scopes and evidence before declaring the audit complete.


## Entry eligibility CPU profile

The session page and registration picker now build an Entry-by-Student map once per calculation, then pass each Student's Entries to the existing eligibility rules. This avoids scanning the whole Entry list for every option. The map is rebuilt from current inputs, preserves Entry order and counts a group Entry once per Student. It does not cache authorization or change submission validation.

Run `env -u ELECTRON_RUN_AS_NODE bun apps/web/scripts/profile-entry-eligibility.ts` to compare the full-list and indexed calculations. The synthetic workload has 3,000 Entries and profiles 150 and 1,500 Students, discarding one warmup and reporting five samples. Index construction is included. Local Bun medians were about 7.9 ms versus 0.4 ms for 150 Students, and 59 ms versus 0.6 ms for 1,500 Students. Every option remains eligible in this benchmark; separate unit cases verify age/gender exclusions, existing registration, group editing, limits, overlapping sessions and duplicate member handling. These are CPU measurements, not browser rendering or network timings.

Verification: 16 focused eligibility tests and the full unit/type/lint/unused checks pass; 24 browser checks pass with four role-inapplicable skips. React Doctor reports existing branch route-ordering and component issues, including complexity in the edited session page; it does not establish an eligibility regression.
