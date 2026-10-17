# Kalakriti Registration

> **Load when**: any Kalakriti Edition work.
> **Related**: `CONTEXT.md` (glossary), `data-layer.md`, `authorization.md`, `notifications.md`, `e2e-testing.md`

## Boundary and model

Kalakriti lives under `/kalakriti/:year`. Logins are Better Auth `user` records, but every Kalakriti row belongs to one `kalakritiEdition`. A linked `teamEvent` exposes the Edition to shared event, reimbursement and vendor-payment workflows without owning Kalakriti state.

Code: schema in `packages/db/src/schema/kalakriti*.ts`; commands, queries and pure rules in `packages/zero/src/{mutators,queries}/kalakriti-*` and `packages/zero/src/kalakriti-*`; constants in `packages/shared/src/kalakriti*.ts`.

Invariants:

- Sensitive joins repeat `editionId`, and composite foreign keys stop any row from crossing Editions.
- A Competition Division (Competition plus Age Category) owns Entries and the Result. A Session only gives a Division a time and Venue; one per Division.
- Edition and Center row locks serialize quotas, yearly-ID sequences, lifecycle changes, scans, results and stock.
- Unique indexes enforce one Membership per person, one Student per Division, unique yearly IDs and at most one `live` Edition.

### Lifecycle

```text
draft -> registration_open <-> registration_locked -> live
```

`archived` is terminal; no transition command targets it. Opening registration needs `kalakriti-registration-readiness.ts`; going live needs [go-live readiness](#go-live). Transitions are audited.

| Capability | Allowed in |
| --- | --- |
| Student and Entry registration | `registration_open` with the Center's control on |
| Existing-Entry music, transport setup, inventory, Guest/Judge rosters | Any nonarchived lifecycle |
| Event-day scans, results, awards | `live` |
| Center name, location, Maps link | Every lifecycle |
| Archived Edition | Read-only, global administrators only |

## Identity and access

Global permissions `kalakriti.view` and `kalakriti.admin` are coarse gates. Operational authority comes from an active Edition Membership plus typed Responsibility Assignments, which never become global roles.

- `apps/web/src/lib/server/kalakriti-edition-access.ts` resolves Edition access; `apps/web/src/lib/kalakriti-registration-scope-policy.ts` turns it into the scopes dashboards and exports share.
- Every command and Zero query checks Edition and assignment itself. Hidden navigation is not authorization.
- The shell opens for Guardians, members with an assignment (even without `kalakriti.view`) and global admins. Unassigned membership grants nothing.
- Lead roles can have several holders; uniqueness is per person plus scope.

### Roles and scopes

| Role | Scope | Capabilities |
| --- | --- | --- |
| Global / Edition administrator | All Editions / one Edition | Everything |
| Volunteer Coordinator | Edition | Volunteer roster and assignments; Liaison assignments; read people rosters; register blank cards; check in non-Students |
| Volunteer Management Volunteer | Edition | Same reads, blank cards and check-in; no assignment or login creation |
| Overall Events Lead | Edition | Categories and Venues; Judge management; attendance; results and finalization |
| Category Lead | Categories | Read Categories/Venues; scoped Judges, attendance and results |
| Competition Coordinator / Volunteer | Competition | Scoped attendance; Coordinators also write results |
| Overall Liaison Lead | All Centers | Read Guardians, Students, Entries, transport and Food; Transport scans |
| Center Liaison Lead, Liaison Volunteer | Assigned Centers | As above, per Center |
| Guardian | Assigned Centers | Register Students and Entries; read own Centers' transport and Food |
| Transport Lead | Edition | Vehicles and Transport scans; sees every Center, no registration writes |
| Food Lead / Member | Edition | Meal scans and Food roster; Leads undo meals |
| Logistics Lead / Member | Edition | Inventory, Dispatch and Return |
| Hospitality Lead / Member | Edition | Read Guests and Judges; Leads manage Guests; check-in |
| Awards Lead / Member | Edition | Read all Competitions and Entries; award handovers |

### Volunteer roster and orientation

`/kalakriti/:year/volunteers` owns the roster. **Create volunteer** adds a name-only local volunteer with no login. **Add volunteers** enrolls central users, including `unoriented_volunteer` users. Linked-event signup (`/register?eventId=`) and approved public interest produce the same active, unassigned membership plus a `team_event_member` row. **Remove from Edition** archives the membership and drops the event member; only administrators can remove an administrator or Coordinator.

Orientation policy (`packages/db/src/kalakriti-orientation.ts`):

- Enrolling a central user, or assigning them any responsibility, changes a persisted `unoriented_volunteer` role to `volunteer`. Other roles are untouched.
- The update and session revocation run in the enrollment transaction. After commit, callers invalidate permission caches and enqueue the role-change notification and orientation WhatsApp only if a row changed.
- Edition creation, pending or rejected interest, local volunteers and Guardian identities never promote. Removal never demotes.

### Guardians and the linked event

- Guardians use the `external_user` role and a `kalakritiExternalIdentity` marker, and are excluded from central user lists and pickers.
- Archiving a Guardian's last active membership bans the account and revokes sessions. The same email can reactivate it in a later Edition.
- Deleting a central user nulls the membership's `userId`; the membership stays.
- On `/events/$id`, the linked event's details are editable, but volunteer add/remove, cancel, recurrence and `isPublic` (lifecycle-driven) are not.

## Registration

- Each Center has separate Student and Entry controls. Commands need an open lifecycle and the relevant control. Bulk lock closes both for every Center; reopens are audited.
- Closing a Center's registration requires every Student, including those with no Entries, to meet `minTotalCompetitions`. The Centers compliance column uses the same rule.
- The Students directory (`kalakritiStudent.visibleForDirectory`) lists every Student in the viewer's Center union. Edits use the Student's real Center, never the table filter.
- Student deletion and Entry removal are blocked once the Student has operations.

### Entry music files

With `musicUploadEnabled`, Guardians, Liaisons and administrators can attach up to two MP3, M4A or AAC files (20 MB each) per Entry.

- New Entries need open registration. Existing Entries accept music changes in any nonarchived lifecycle; upload signing validates the `entryId`'s Edition, Center and Division.
- `kalakritiEntry.updateMusic` takes additions plus explicit `removeMusicFileIds`, so a stale dialog cannot drop another editor's files. A locked count check and unique slots both reject a third file.
- The flag is not eligibility. Turning it off blocks uploads but keeps playback, download and removal for anyone whose scope covers the Entry.
- Audit metadata never holds filenames or object keys.

## Centers and transport

### Center detail sheets and editing

A Centers row opens a sheet at `/kalakriti/:year/centers?centerId=...`, resolved against the authorized directory so links cannot bypass scope. Transport there is read-only.

The Edit modal saves basic fields, registration controls and Guardian/Liaison assignments separately. Name, `location` and HTTPS `googleMapsUrl` are editable in every lifecycle, including retired Centers. Create, retire and delete keep structural locks. Volunteer Coordinators can edit only Liaison assignments.

### Transport directory and pickup times

`/kalakriti/:year/transport` lists each authorized active Center with one row per vehicle, or a placeholder. `kalakritiTransport.centers` never joins Students or Entries.

- Vehicles hold `vehicleLabel`, driver contacts, capacity, notes and optional `pickupTime`, shown in the browser's timezone.
- Transport Leads and administrators manage vehicles; Guardians and Liaisons read their own. Writes take Edition and Center locks and reject archived Editions and retired Centers. Delete sets `deletedAt`, which hides the vehicle from lists, readiness and notifications.
- Field changes notify the Center's Guardians and Liaisons (`notify-kalakriti-transport-changed`).
- Vehicle status is read-only, projected from [Center stage finalization](#transport-scans-and-status).

## Guests, Judges and Events Lead Judge management

`kalakritiAttendee` holds Guests and Judges: name, phone, optional email and a yearly ID, with no login or membership.

| Actor | Guests | Judges |
| --- | --- | --- |
| Administrators | Manage | Manage |
| Hospitality Lead | Create, edit, archive | Read |
| Hospitality Member, Volunteer Coordinator, Volunteer Management Volunteer | Read | Read |
| Overall Events Lead | None | Add, edit, delete, assign |
| Category Lead, Competition Coordinator | None | Read Judges in scope |

- Guests are archived, which keeps history and blocks scans. Judges are deleted: `kalakritiAttendee.delete` removes assignments and the row, but refuses if any check-in or meal history exists.
- Judge yearly IDs are never reused. Allocation and deletion advance `nextJudgeSequence` under the Edition lock.
- `kalakritiJudgeAssignment` links Judges to whole Competitions, many-to-many. It grants no scoring or attendance rights. Scoped queries filter nested assignments, so other categories stay hidden.

## Yearly IDs, QR codes and ID cards

| Person | Yearly ID | Allocated |
| --- | --- | --- |
| Student | `KAL-{year}-{seq}` | On registration |
| Volunteer | `KALV-{year}-{seq}` | On enrollment, under the Edition lock |
| Guardian | `KALG-{year}-{seq}` | In registration, from `nextGuardianSequence` |
| Guest, Judge | Attendee yearly ID | On creation |

IDs are immutable and never reused. A later Edition gets a new one.

### Detail-sheet JSON QR codes

`components/kalakriti/person-qr-panel.tsx` shows `{"id":"<record-id>","type":"student|guardian|volunteer|guest|judge"}` on every person detail sheet. The `id` is the Student, Edition Membership or Attendee record ID, never the yearly ID or contact details.

- There is no credential table, and a QR proves nothing. Scanners check the stored kind matches `type`, then authorize operator and subject separately.
- `GET /api/kalakriti/:year/people/lookup?humanId=` accepts a yearly or record ID and returns allowlisted details. It is administrator-only and Edition-bound.

### ID-card PDFs and blank printed cards

- **Download ID cards** (Edition dashboard, administrators only) calls `/api/kalakriti/$year/id-cards`, which rechecks access and returns a private, no-store PDF, four cards per A4 page. Inactive people, retired Centers and cancelled Competitions are excluded.
- Blank Volunteer, Guest and Judge cards download from **ID cards and registration tools**.
- **Register ID card** turns a blank card's printed UUID into the new record's ID. Administrators, Volunteer Coordinators and Volunteer Management Volunteers can use it. `functions/kalakriti-blank-id-card.ts` rejects UUIDs already in use; exact retries succeed.
- A Volunteer card without an email creates a no-login membership (`createLocalVolunteer` with `requirePrintedCardId`). With an email it creates and enrolls a central user, which needs `users.create`.
- Scanning is lookup-only, so register a blank card before scanning it.

## Public schedule, exports and audit

- `/api/kalakriti/:year/schedule` is unauthenticated and allowlisted: Edition display fields, Competition, Category, Age Category, Venue, time and cancellation. No staff, contacts, Students or music.
- Once the linked event starts or is cancelled, the schedule page hides sign-up from outsiders.
- `/api/kalakriti/:year/registration-export` builds an allowlisted ZIP on the server, private and non-cacheable, with spreadsheet formulas neutralized. There is no CSV import.
- Kalakriti audit entries are Edition-owned; reads apply Edition and responsibility scopes.

## Go-live and event-day operations

### Go-live

**Go live** is offered only from `registration_locked`. `kalakriti-go-live-readiness.ts` blocks it until registration configuration is complete, active Centers' controls are closed, Overall Events, Transport and Food Leads are assigned, and every active Center has a vehicle. The transition rechecks readiness and the single-live rule, and closes every Center's controls.

### Operation recording

`packages/zero/src/mutators/kalakriti-operation.ts` records on the server only.

- `record` takes a person QR string of exactly `{ id, type }`; `recordManual` takes a yearly ID. Both reject type mismatches.
- Writes need a `live` Edition and an operator authorized for that type and scope.
- `kalakriti_operation` is append-only with a unique `operationId`. A retry by the original recorder is a no-op; nobody else can reuse the key.
- Guardians can only be checked in or fed. Guests and Judges get no transport or attendance.

### Role-aware scanning

The sidebar **Scan** button opens one modal whose tabs are the union of the operator's activities. Tabs are a convenience; the server decides.

| Activity | Staff | Subject | Lifecycle |
| --- | --- | --- | --- |
| Transport | Administrators, Transport Leads, scoped Liaisons | Center roster at the pinned stage | Live |
| Check-in | Administrators, Volunteer Coordinators, Volunteer Management Volunteers, Hospitality | Volunteers, Guests, Judges; Guardians only by administrators and the two volunteer-management roles | Live |
| Meals | Administrators, Food | Picked-up Students; checked-in Volunteers, Guests, Judges; active Guardians | Live |
| Attendance | Administrators, Overall Events Leads, scoped Category Leads and Competition staff | Picked-up Student in the Session's Division; uncancelled Session | Live |
| Dispatch / Return | Administrators, Logistics | Active Volunteer | Nonarchived |

Manual ID entry sits in a collapsed section under the camera.

### Transport scans and status

`components/kalakriti/center-scan-dialog.tsx` picks one Center, waits for its full roster, and pins the current stage. Scans mark Students without advancing the Center.

| Stage | Scans | Center status after finalization |
| --- | --- | --- |
| `pickup` | Boarding at the Center | `departed_center` |
| `venue_arrival` | Arriving at the venue | `arrived_at_venue` |
| `venue_departure` | Leaving the venue | `departed_venue` |
| `drop_off` | Back at the Center | `completed` |

- Pickup can finalize once one Student is marked; unmarked Students drop out of the trip. Later stages need every picked-up Student.
- `kalakritiCenterScan` commands require the pinned `expectedStage`, so stale stages fail and finalization cannot skip ahead. Generic operation APIs apply the same rules.
- Finalization closes the dialog, audits marked and absent counts, and writes status and history to every non-deleted vehicle.
- Student status follows that Student's scans; Center status follows finalization.

### Volunteer check-in

Check-in records `volunteer_check_in`, `attendee_check_in` or `guardian_check_in`. Guardians eat without it. The Volunteers table shows a read-only **Checked in** column.

### Competition attendance, Present and Attended

- **Scan attendance** on a Competition page locks the scanner to its Session.
- In group Competitions, one scan also marks teammates who are present; absent ones are skipped. Each new member gets its own operation and audit entry.
- Attendance is append-only, with no undo.
- **Present** is effective `venue_arrival`. **Attended** is effective `competition_attendance` for the Division's actual Session, never another Session. `kalakritiEntry.visibleByDivision` returns only that Session's attendance.

### Food roster and meal undo

`/kalakriti/:year/food` lists only currently meal-eligible people.

- Administrators and Food staff see the whole Edition; Guardians and Liaisons see their Centers, and Guardians always see their own row. Reading never grants recording.
- Guests and Judges reach Food staff through a server projection (`functions/kalakriti-food.ts`), because Zero would sync their contacts.
- Administrators and Food Leads can undo a meal while Live. `kalakritiOperation.undoMeal` appends a `meal_correction` and never deletes. The meal can then be served again by a fresh scan, not by continuous camera frames.

## Inventory items and stock history

`/kalakriti/:year/inventory` is open to `kalakriti.admin` and `edition_admin`, `logistics_lead` and `logistics_member` assignments in any nonarchived lifecycle.

- Items have a name, optional photo, quantity and paise unit price. Opening stock writes an `initial_inventory` transaction.
- Purchases and returns add, dispatches subtract and reject shortfalls. Returns do not reconcile against dispatches. Adjustments need a reason and fail if the balance changed since it was shown.
- Dispatch and Return scan a Volunteer, then take up to 100 items. The optional Competition or role must be one of that Volunteer's assignments and is stored as a snapshot.
- `recordBatch` preflights every line under the Edition lock, so failure writes nothing.
- `kalakriti_inventory_transaction` is append-only. Items can be archived only at zero stock.

## Competition workspace and Settings

### Competition/Entries workspace

`/kalakriti/:year/competitions` has one row per Division; `?competition=<divisionId>` opens its Entries on the same route. Old `/entries`, `/competitions/*` and `/eligibility` URLs redirect here or to Settings.

- Guardians and Liaisons see Entries across their Centers. Awards roles read everything.
- A new Entry belongs to one Center, and every member must too.
- Row status comes from a scoped server projection: Cancelled/Retired, Winner assigned, Finished, Running (first attendance scan), Scheduled, Not scheduled.

### Per-Division scheduling

The Competition editor sets an optional Venue, start and end per Division. `createCompetition` and `updateCompetition` save rules, Divisions and Sessions in one transaction, checking ownership, the event date, Venue overlap and Student overlap.

- After registration locks, names, Session times and Venues can still change. Eligibility, Divisions and Competition create, delete and retire stay locked.
- During Live, a Competition or Session can be cancelled or restored only after withdrawing its published results and reopening finalization.
- `sequentialPerformances` is display-only. It adds a Next column suggesting running order from each Student's next Session, exposing only `{ studentId, competitionName, startAt, venueName }`.

### Settings tabs

`/kalakriti/:year/settings` has Edition, Categories, Venues and Eligibility tabs. Administrators see all; Overall Events Leads manage Categories and Venues; Category Leads read them. Edition and Eligibility repeat the administrator guard.

## Results, Center standings and finalization

`packages/zero/src/mutators/kalakriti-result.ts` runs server-only. Each Division has one current result.

- Scoped result staff publish exactly two awards, winner and runner-up; each awarded Entry needs one attended member.
- Publishing needs one to ten PDF, JPEG or PNG scorecards, 20 MB each.
- Commands take the Edition lock and compare versions. Corrections keep old revisions.
- The first publication freezes the point values (default 10/5). Points count once per Entry.
- `getKalakritiStandings` gives Center aggregates to everyone with Edition access, ranked by points then wins. Result detail and scorecards stay with result staff.
- Overall Events Leads and administrators finalize when every active Division is scheduled and has both awards and at least two Centers rank. Ties at first or second need an order and reason. Reopening keeps history.

## Awards handovers and undo

`/kalakriti/:year/awards` shows published recipients to Awards roles and administrators, ordered by first publication.

- Each Student's prize is tracked per Entry and award; groups can be handled whole.
- `kalakriti_award_handover` stores status and version; no row means pending. `kalakriti_award_command` stops retries replaying an old action after an undo.
- `kalakritiAward.set` checks published eligibility and versions under the Edition lock. Both Awards roles can award and undo while Live, even after finalization.
- Result changes are refused while an affected prize is marked awarded; undo the handover first.

## Role dashboards and work-page summaries

- The Edition overview shows a phase-aware role workspace, scoped registration breakdowns and Center standings. `lib/server/kalakriti-dashboard-summary.ts` returns only authorized aggregates; `components/kalakriti/role-dashboard.tsx` merges roles and caps Needs attention at five groups.
- `use-dashboard-snapshot.ts` refreshes on focus, on scanner close and every five seconds while Live. Failures show stale data; denied reads clear it. Loading never shows zero.
- `lib/kalakriti-dashboard-filter.ts` turns a dashboard link's `dashboardFilter` into visible table filters.
- Work pages show a `SummaryMetricCards` row counted over the full authorized set, not the filtered slice. Transport stage counts are never summed.

## Testing

Specs: `packages/e2e/tests/kalakriti/`. The dashboard database test needs `KALAKRITI_DASHBOARD_DB_TEST=1`. Lanes and the release gate: `e2e-testing.md`.
