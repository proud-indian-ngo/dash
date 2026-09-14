# Kalakriti Registration

> **Load when**: Kalakriti Edition access, Guardian identity, Center controls, eligibility, Competition configuration, Student or Entry registration, public schedule, registration dashboards, audit, or exports.
> **Related**: `data-layer.md`, `auth.md`, `authorization.md`, `notifications.md`, `jobs.md`, `e2e-testing.md`

## Boundary

Kalakriti is a native Edition-bound module under `/kalakriti/:year`. Better Auth remains the only login system and central volunteers remain normal `user` records, but every Kalakriti business row belongs to one `kalakritiEdition`. A linked `teamEvent` exposes the Edition to shared event, reimbursement, and vendor-payment workflows without making the generic event domain authoritative for Kalakriti state.

Registration writes close at `registration_locked`, while existing-entry music edits follow their separate policy. Sidebar scanning records operations only in `live` Editions; a go-live action remains behind a later release gate. Center transport setup and forward status tracking are available in nonarchived Editions. Results, awards, scoresheets, and inventory remain behind later release gates.

## Identity and access

Global permissions provide the coarse module gates `kalakriti.view` and `kalakriti.admin`. Operational authority is resolved from an active Edition Membership plus typed Responsibility Assignments; responsibilities never become global roles.

- Global administrators can access every Edition, including archived Editions.
- Edition administrators manage the complete active Edition.
- Volunteer Coordinators manage the volunteer roster and assignments on `/kalakriti/:year/volunteers`. That page owns roster membership, not Overview. **Add volunteers** puts people on the roster with no role (Unassigned). **Assign role** on a row or detail sheet grants a responsibility. Successful enrollment automatically changes `unoriented_volunteer` to the oriented `volunteer` role; admin and custom roles remain unchanged. Removing the last role leaves them Unassigned with linked-event access. **Remove from Edition** archives membership and drops the linked event member.
- Overall Events Leads and Category Leads receive Competition-category scopes. Lead roles are multi-occupant; assignment uniqueness is per person plus scope, not one occupant per Edition.
- Liaisons and Guardians receive explicit Center scopes. Overall Liaison Lead is Edition-wide: no Center picker, and the assignment covers every Center. Center Liaison Lead and Liaison Volunteer are per Center.
- Unassigned volunteer membership is a valid roster state. Edition **access stays fail-closed**: opening the Kalakriti shell still requires Guardian membership, at least one assignment, or global admin. Unassigned volunteers remain visible to roster managers and in the authorized Edition-wide Food roster; they gain no additional Edition access.

Signup via `/register?eventId=` on the linked event, coordinator **Add volunteers**, and **approved public interest** on a Kalakriti-linked event all create the same destination: active unassigned volunteer membership plus `team_event_member` on the linked event. Direct responsibility assignments at every scope apply the same orientation policy, including reactivation and replay of existing active membership. Edition creation doesn't enroll its creator, so creation alone doesn't promote anyone. Pending interest, rejected enrollment, unrelated events, and Guardian or external identities never trigger promotion. Removing a responsibility or membership never demotes the global role.

`packages/db/src/kalakriti-orientation.ts` owns the conditional SQL update: only the persisted `unoriented_volunteer` role with active volunteer membership in a non-archived Edition qualifies. The update and session revocation run inside the enrollment transaction, so failure rolls both back and a concurrent role change isn't overwritten. After commit, callers invalidate the role-permission caches and enqueue the established role-change notification and orientation WhatsApp jobs only when the update changed a row. Zero commands remain inside the central mutation audit boundary; unauthenticated signup remains excluded.

Linked event details are editable from `/events/$id` (name, location, description, schedule, notifications) for `events.edit` / team lead or `kalakriti.admin` / Edition administrator. Generic event volunteer add/remove, cancel, and `isPublic` stay off that page; `isPublic` stays lifecycle-driven. Recurrence and inherit-volunteers do not apply to Edition events.

Edition Membership snapshots remain as historical records after a central user is deleted: the membership's `userId` and creator attribution become null rather than blocking account deletion or erasing the membership. Guardians use the technical `external_user` role and a persistent `kalakritiExternalIdentity` marker. Their yearly profile and access live in Edition Memberships. Edition administrators and global administrators can update an active Guardian's yearly name, email, and phone; dedicated external identities also update login email and phone, while assigned central volunteer accounts keep their login email. Archiving the final active Guardian membership bans the external account and revokes its sessions; exact-email reuse can reactivate the identity for a later Edition. External identities are excluded from central user lists and volunteer pickers. **Assign role** and scoped responsibility pickers include `unoriented_volunteer`, because successful assignment promotes them. **Add volunteers** also includes them and excludes people already on the roster. Assigned members can open their Edition even when their global role lacks `kalakriti.view`.

`apps/web/src/lib/server/kalakriti-edition-access.ts` resolves Edition access. `apps/web/src/lib/kalakriti-registration-scope-policy.ts` converts that access into the canonical registration scopes shared by dashboards and exports. Commands and Zero queries perform their own Edition and assignment checks; hidden navigation is never treated as authorization.

## Guests and Judges

The Guests and Judges pages own Edition-bound `kalakritiAttendee` records with required name and phone, optional email, and a stable yearly ID. These people have no login account, external identity, or Edition Membership. Global/Edition administrators create, edit, archive, and assign attendees in any nonarchived Edition, including Live; archiving preserves operation history and blocks new scans.

Volunteer Coordinators can read both rosters. Overall Events Leads can read Judges Edition-wide; Competition Category Leads and Competition Coordinators see judges assigned within their existing scopes. These read permissions include detail sheets and identifier QRs but do not grant roster writes, assignment writes, check-in, or meal recording. Scoped judge queries also restrict the nested Competition assignments, so a judge shared with another category does not reveal that category's assignments.

Administrators assign competitions through **Assign competitions** in a judge's row menu or detail sheet. `kalakritiJudgeAssignment` is a many-to-many join: one judge can cover multiple competitions and each competition can have multiple judges. Commands validate active Judge kind and same-Edition Competition references; composite foreign keys and a unique attendee/Competition pair prevent cross-Edition and duplicate assignments. Assignment is for the whole Competition, not an age-category Division, and does not create scoring or Competition-attendance permissions.

Attendee QR JSON uses `{"id":"<attendee-record-id>","type":"guest|judge"}` with one concrete type, never contact information. The shared **Check-in** activity accepts Volunteers, Guests, and Judges; the server records guests/judges as `attendee_check_in` with an `attendeeId` subject. Guests and judges must check in before breakfast or lunch, cannot receive transport or Student Competition-attendance operations, and use the existing append-only meal correction and retry rules.

Food-only staff receive an authenticated, explicit-column attendee projection rather than full Zero attendee rows, because Zero synchronizes whole rows including contact fields. This projection exposes identity, eligibility, and meal state to Edition-wide administrators/Food staff only; Center-scoped readers do not receive Guest/Judge rows. `functions/kalakriti-food.ts` owns the server projection; `components/kalakriti/use-food-attendees.ts` refreshes every five seconds, on focus, and after meal undo. Its refresh lifecycle participates in Food snapshot readiness so loading does not render false unserved statuses.

Migration `0083_ambitious_cable.sql` adds attendees, judge assignments, and the attendee operation subject/type. Generate and deploy the matching Zero schema with the migration and application. The `guests-judges.spec.ts` invariant-lane E2E test covers non-login creation, decoded QRs, multiple Competition assignments, read-only head access, QR/manual check-in, meal prerequisites, duplicate serving, undo/re-serving, and archived history.

## Data and command ownership

The Drizzle schema is grouped in `packages/db/src/schema/kalakriti.ts`. Registration commands and queries live under `packages/zero/src/mutators/kalakriti-*` and `packages/zero/src/queries/kalakriti-*`; pure registration rules remain in focused `packages/zero/src/kalakriti-*` modules.

Every sensitive join repeats `editionId`, and composite foreign keys prevent a Center, Age Category, Competition Division, Session, Student, Entry, or Assignment from crossing Edition boundaries. A Competition Division pairs one Competition with one Age Category and owns Entries and future Result ranking; a Competition Session only assigns that Division a time and Venue. PostgreSQL row locks serialize quota, Student-ID sequence, and lifecycle decisions. Unique indexes back duplicate Membership, one-Student-per-Division, one Session per Division, unique volunteer yearly IDs, and one live Edition invariants. Assignment uniqueness is per person plus scope; lead roles including Overall Events Lead may be held by more than one volunteer.

The lifecycle edges exposed by this release are:

```text
draft -> registration_open <-> registration_locked
```

Opening or reopening requires a complete readiness snapshot. Center Student and Entry controls are independent, bulk lock closes both controls for every Center, and every explicit reopen is audited. Registration commands require both an open Edition lifecycle and the relevant Center control. Closing Center participation registration, individually or through bulk lock, requires every registered Student to meet the Edition `minTotalCompetitions` floor, including Students with zero Entries. Centers with no Students may close. The Centers directory compliance column applies the same rule.

A Competition may set `musicUploadEnabled`. Guardians, Liaisons, Edition administrators, and global `kalakriti.admin` users can manage up to **two optional audio files per Entry**, each MP3, M4A, or AAC and at most 20 MB. Existing Entry music can be added or removed after Center or Edition registration closes; participant registration and editing remain locked. Music changes require the actor's existing Center/Edition scope, active Center/Competition/Category records, and a nonarchived Edition.

The separate music modal accepts multi-selection and drag-and-drop, shows each file's upload status, and lets the operator retry or remove an individual failed upload without losing successful uploads. Save applies additions and explicit file removals atomically; Cancel leaves persisted files unchanged and cleans staged temporary uploads. The table owns the modal outside its cells so live row updates don't discard staged uploads. Its Music column displays a file count and individual filenames; each filename opens a table-owned playback modal with native audio controls and a protected Download action, independently of music-edit permission.

`kalakritiEntryMusic` owns each file's metadata and Edition-bound Entry reference; scoped Entry queries expose the `musicFiles` relationship. `kalakritiEntry.updateMusic` accepts additions and explicit `removeMusicFileIds`, so saving an older dialog doesn't silently remove files added by another editor. The server serializes writes and checks the resulting file count before claiming objects. Creation, removal, promotion, and delayed reference-checked storage cleanup use individual file records; audit metadata contains identifiers and counts, never filenames or object keys.

New-entry uploads still require open Edition and Center Entry registration. Existing-entry upload signing includes `entryId` and validates its exact Edition, Center, and Division before allowing the post-registration write window. The music flag is not participant eligibility: it can change after Entries exist until the Edition is structurally locked. Turning it off blocks new claims without revoking downloads or the backend's scoped removal permission. Anyone whose registration scope covers the Entry, including Overall Events Leads, Category Leads, and Competition Coordinators, may download. Public schedule and registration export never include music keys, filenames, or binaries.

## Entry music migration

Apply the two generated migrations in order: `0079_mighty_kronos.sql` adds the parent composite unique constraint, and `0080_gray_punisher.sql` adds `kalakriti_entry_music`. The child table has an Edition-composite Entry foreign key, unique object keys, and two unique slots per Entry; the database therefore also rejects a third file independently of the mutator's locked count check.

The application and generated Zero schema must match these migrations. Legacy singleton music columns are no longer part of the current model; existing music files are served through protected playback and download from child records. The repository no longer includes a singleton-to-child data backfill command.

## Public and server-only projections

Every authorized viewer of a Volunteer, Guardian, Student, Guest, or Judge detail sheet sees that person's identifier QR through `components/kalakriti/person-qr-panel.tsx`. The browser renders JSON directly from already-scoped row data: `{"id":"<database-id>","type":"student|guardian|volunteer|guest|judge"}` (one concrete type per payload). `id` is the Student record ID for Students and the Edition Membership record ID for Guardians and volunteers; Guests and Judges use their Attendee record ID. It never uses the yearly display ID. There is no issuance, replacement, secret token, or additional admin gate for these QRs. Opening a sheet never writes credential records.

Guardian sheets show assigned Centers; Student sheets show their Center and registered individual/group competitions, including cancellation status. There is no standalone Credentials page or navigation item. Existing page and query scopes still determine whose details a viewer can access; QR visibility does not make personal records public.

`GET /api/kalakriti/:year/people/lookup?humanId=` accepts the existing yearly or record identifier and returns allowlisted Student, Volunteer, Guardian, Guest, or Judge details without requiring a credential row. The lookup retains its administrator gate and Edition boundary. Scanners parse the JSON and use its `id` to look up the subject, then verify that the stored subject kind matches `type`. An identifier QR is not proof of identity or permission: scanner commands must authorize the operator and validate subject eligibility independently.

The legacy credential table, token hashing, issuance/reissue mutators, and PDF card printing are removed. JSON QR display and person lookup depend only on Student, Edition Membership, and Attendee records. The person-QR E2E suite covers decoded payloads, stable display, scoped nonadmin visibility, and lookup; former credential routes return 404.

`/api/kalakriti/:year/schedule` is unauthenticated and returns an explicit allowlist: Edition display fields plus Competition, Age Category, Venue, time, and cancellation status. It never returns staffing, contacts, Students, submissions, evidence, music files, or `musicUploadEnabled`.

Registration dashboards and `/api/kalakriti/:year/registration-export` resolve the actor and Edition on the server. The export route builds an allowlisted ZIP on the server, returns it as a private non-cacheable attachment, neutralizes spreadsheet formulas, and never sends raw registration rows to the browser. CSV import is intentionally unavailable.

Audit reads apply Edition and responsibility scopes before returning privacy-safe metadata. Mutation audit entries remain Edition-owned and record the actor, domain, action, target, timestamp, reason where required, and structured metadata.

## Center transport

Center detail pages expose vehicle assignments with capacity, driver contact fields, and notes. `kalakritiTransport.create`, `update`, and `delete` serialize writes through Edition and Center row locks, reject archived Editions and retired Centers, and audit the commands. Deletion requires confirmation and sets `deletedAt`, preserving the assignment and its history while excluding it from active lists, readiness checks, and pending notifications. Individual vehicle status is read-only. Completing a Center scan stage transactionally projects the derived status to every non-deleted vehicle at that Center and appends status history. Vehicles created later inherit the latest finalized Center status.

The Edition's Transport Lead and global/Edition administrators manage transport Edition-wide. There is no per-Center transport role. Center-scoped Liaisons and Guardians can read their own Center's transport details but cannot create, edit, or delete vehicle assignments. Authorized Center Liaisons can scan Students and finalize Center stages; Guardians cannot. Transport Leads can discover all Edition Centers without gaining Student or Entry registration-write permissions. Assign the Transport Lead through the normal Edition-scoped volunteer assignment workflow.

Vehicle/driver field updates enqueue `notify-kalakriti-transport-changed` after commit with a deterministic assignment/change key. Recipients are the affected Center's active Guardians and Liaisons; transport details are not public schedule data. The root seed creates one planned demo vehicle and its initial history atomically and idempotently, without changing progressed vehicles or archived Editions.

## Event-day operation spine

`packages/zero/src/mutators/kalakriti-operation.ts` owns server-authoritative recording; the client phase performs no optimistic writes. `record` accepts `personQr`, a bounded JSON string containing exactly `{ id, type }`, matching the detail-sheet QR format. It resolves the persisted Student, active Volunteer/Guardian membership, or active Guest/Judge attendee inside the requested Edition, rejects mismatched types, and restricts Guardian subjects to meals. `recordManual` resolves an Edition yearly ID through the same subject and operation rules; neither path uses credential storage or token hashes.

New writes require a `live` Edition and an authorized operator. Edition/global administrators can record all types; other staff are restricted by operation type and their Center or Competition assignment. Attendance additionally requires a valid in-Edition session and the Student's registration in its Division. Transport ordering, volunteer check-in, and meal eligibility are enforced independently of QR possession.

`kalakriti_operation` is append-only and has a unique `operationId`, XOR subjects, and Edition-composite subject/session references. A retry by the original recorder or global administrator is a no-op even if the submitted type or subject changes; another recorder or Edition cannot reuse the key. Replays don't create audit rows or duplicate operations. Student deletion and Entry removal are blocked once their Students have recorded operations. `event_day_operation` audit entries contain only bounded operation metadata. The seed script leaves draft Edition operations empty and adds an idempotent sample pickup only when the demo Edition is live and its sample Student has no history. E2E fixtures exercise idempotent recording against isolated live Editions.

## Role-aware scanning

The Kalakriti sidebar **Scan** button opens a shared modal, not a separate Event day page. Available activities are the union of the operator's active Edition assignments. Administrators see all activities; multiple activities appear as tabs, while single-activity staff do not need a tab selector.

| Activity | Authorized staff | Eligibility |
| --- | --- | --- |
| Transport | Global/Edition administrators, Transport Leads, scoped Center Liaisons | Center roster and current pinned stage |
| Check-in | Global/Edition administrators, Hospitality Leads/members | Active Edition Volunteer, Guest, or Judge |
| Meals | Global/Edition administrators, Food Leads/members | Student pickup, Volunteer/Guest/Judge check-in, or active Guardian Edition registration; selected breakfast/lunch service |
| Attendance | Global/Edition administrators, assigned Competition Volunteers/Coordinators | Picked-up Student registered in the selected session's Division; valid, uncancelled in-Edition session |

The browser tabs are a convenience, not an authorization boundary. Every operation validates role, subject, Edition, eligibility, and session scope on the server. QR input uses person JSON and manual input uses yearly IDs; neither authorizes an operation. Changing scanning activity or session ends the previous camera context, and pending writes cannot change their operation arguments. Archived Editions expose no scanning, and new writes require a live Edition.

## Go-live

The lifecycle action offers **Go live** only from registration-locked Editions. Its blocker list uses the shared go-live readiness helper: registration configuration, closed active-Center controls, active Overall Events/Transport/Food Lead assignments, and transport assignments for active Centers. There is no credential or person-ID readiness gate. Confirmation explains that scanning starts and Center registration controls close; existing person QRs, lookup, and transport setup remain available. The server rechecks readiness and the single-live-Edition constraint in the transition transaction.

## Student directory

The Students page uses `kalakritiStudent.visibleForDirectory({ editionId })` to list Students across the viewer's authorized Center union, without requiring a page-level Center selection. ReUI filters cover the seven data columns: Center (stable ID), ID (yearly Student ID), Student (name), Transport status, Date of birth, Gender, and Age Category. Hiding a column does not remove its filter. Transport filtering uses the same retained labels as the displayed column, without treating unknown status as awaiting pickup. Obsolete non-column filter predicates are removed recursively from saved URL expressions; supported filters and their groups survive. Legacy authorized Center links become visible Center filters in the same normalization flow, rather than hidden constraints. Guardian and Liaison access includes all Students in their authorized Centers, not just their own registrations; unrelated Centers and Editions remain inaccessible.

Creation explicitly targets a writable Center and retains its registration, age-category, and quota checks. Viewing, editing, and deletion use the selected Student's actual Center, never the table's filter selection. Transport status continues to use retained authoritative snapshots, and filtering grants no additional permissions.

## Guardian yearly-ID allocation

New Guardian memberships receive an immutable yearly ID such as `KALG-2026-0001` in the same transaction as registration. The shared creation funnel locks the Edition before inserting the membership, avoiding foreign-key lock-upgrade races, then allocates from its separate `nextGuardianSequence`. Existing IDs, including archived memberships' IDs, reserve their sequence numbers. Same-Edition retries keep the existing ID; a later-Edition registration receives a new membership and year-specific ID. Migration `0082_guardian_yearly_ids.sql` adds the counter and positive-value constraint.

Historical Guardian memberships without an allocated ID display a dash in the roster; new memberships receive IDs through the registration transaction.

## Food and check-in reporting

`/kalakriti/:year/food` lists only currently meal-eligible people: picked-up Students, checked-in active Volunteers/Guests/Judges, and active Guardians. Eligibility is a base roster restriction, not a filter or column. Name, Person ID, Role, Center, Breakfast, and Lunch filters operate on the table; meal cells show green checks for Served and red crosses for Not served, with accessible labels and tooltips. Global/Edition administrators and Food staff see the Edition-wide roster. Guardians and Liaisons see their authorized Center union, including all Centers for Overall Liaison Lead; linked volunteers must intersect that scope, and related Center labels stay within it. Guardians can also see their own meal row without a Center assignment. Read access never grants meal-recording permission, and archived Food views are restricted to global administrators. Registered/eligible/served totals cover the whole authorized roster and do not change with table search or filters. Served totals retain archived history, so they can exceed the number of eligible table rows. The table waits for its first complete snapshot, retains eligible rows and their meal sorting/filter values during synchronization gaps, and removes ineligible or archived rows once a complete update arrives; a scope change discards the retained snapshot.

Guardian meals reuse the existing membership-subject ledger. Guardian yearly IDs use `KALG-{year}-{sequence}`, alongside Student `KAL-` and Volunteer `KALV-` IDs. The Guardians table, its Yearly ID filter, and the Guardian detail sheet display the existing membership `humanId`; historical memberships without an allocated ID show a dash. Food uses the yearly ID when available and otherwise displays the membership record ID. Guardian QR JSON always identifies the Edition Membership UUID with type `guardian`, and manual meals accept both the yearly ID and the legacy membership UUID. Active Edition registration is sufficient; Guardian check-in is not required, and Guardians cannot be recorded for volunteer check-in, transport, or Competition attendance. Served history remains separate from current eligibility.

The Volunteers table displays read-only green checks/red crosses in **Checked in**, derived from effective `volunteer_check_in` operations. Food and check-in displays wait for an initial complete snapshot and retain known values during later synchronization gaps rather than showing false negative statuses.

Global/Edition administrators and Food Leads can undo an effective breakfast or lunch mark after confirmation, only while the Edition is Live and the client has authoritative connected data. Food Members and scoped readers cannot undo meals. `kalakritiOperation.undoMeal` appends a `meal_correction` record and links the exact original meal to it; it never deletes the original. Stale targets cannot clear a replacement serving, and retries retain their original operation IDs.

Undo leaves personal eligibility unchanged and makes that meal available again. A new explicit scanner capture session can allocate a fresh serving ID for a previously confirmed attempt; pending or uncertain attempts retain their original arguments. Continuous camera frames do not automatically re-serve a person when an undo arrives. Migration `0081_uneven_sue_storm.sql` adds the correction enum value.

## Center-agnostic Entries and arrival

The Entries page remains a Division/session directory, but neither it nor its detail view requires a Center selection before loading. The `$id` in `/entries/$id` identifies the Competition Division, not an individual Entry or Session record. The directory omits Center and arrival columns. Event-detail tables retain Center filtering within the already-authorized data. Guardians and Liaisons see all Entries and eligible Students across their assigned Center union, including multiple Centers; existing administrator and Competition-scoped access remains intact. Creation still selects one authorized Center, and all members must belong to that Center. Existing write and registration/music guards remain authoritative.

Event-detail **Present** status is derived from effective `venue_arrival` scans and stays recorded after venue departure and return. **Attended** uses effective `competition_attendance` for the Division's actual Competition Session ID, never the Division ID or another Session. Group totals count unique members, with individual member statuses and filters for the displayed data fields. `kalakritiEntry.visibleByDivision` validates the Session/Division/Edition relationship and returns only that Session's attendance, preventing unrelated Competition marks from being exposed.

## Center scan sessions

The Transport activity uses `components/kalakriti/center-scan-dialog.tsx`. Guardians and Food-only staff cannot use Transport. Recording and finalization require a live Edition and connected client. The modal's stable owner lives outside the mobile sidebar sheet so closing navigation does not release the camera.

A session selects one Center and waits for the complete roster/stage query before pinning its current stage. When only one Center is available, it is selected automatically and shown as plain text rather than a dropdown. Later synchronization gaps pause scanning without resetting that pinned stage. Each Student QR scan or yearly-ID entry marks that Student for that stage, without advancing the Center. The camera remains active between Students, and successful marks show a named toast. Camera startup failures leave manual entry available. Backend duplicate checks prevent repeated marks; operation-ID retries remain safe even after a stage changes.

| Current stage | Operator scans | Status after explicit finalization |
| --- | --- | --- |
| `pickup` | Students boarding at their Center | `departed_center` |
| `venue_arrival` | Students arriving at the event venue | `arrived_at_venue` |
| `venue_departure` | Students leaving the event venue | `departed_venue` |
| `drop_off` | Students returning to their Center | `completed` |

`kalakriti_center_scan_stage` stores one durable stage per Edition/Center/stage, including creator and finalizer attribution. Pickup uses the Center's Student roster and can finish once at least one Student is marked; the confirmation shows how many remain absent. Unmarked Students are excluded from the rest of the trip. Venue arrival, venue departure, and return require every effectively picked-up Student to be marked before finalization. The modal shows marked and missing Students, and the finalization audit records marked and absent counts. There is no departure-from-Center-for-home stage.

`kalakritiCenterScan.record`, `recordManual`, and `finalize` require a pinned `expectedStage` and selected Center. The shared progress helper derives the stage, roster, and completion from scoped Students, effective operations, and finalized stage rows. Edition and Center locks serialize scanning, finalization, and vehicle status projection. Generic operation APIs apply the same current-stage rules to new transport writes, so they cannot bypass Center finalization.

Finalization closes the modal and ends scanning; the next real-world checkpoint requires reopening it. If another operator finalizes the Center, the open session stops rather than retargeting its camera. New requests with a stale stage are rejected, while retries of a previously recorded operation remain no-ops. Repeated finalization cannot advance a second stage. Vehicle notifications use the finalized stage ID and assignment ID for deterministic keys.

Migration `0078_watery_revanche.sql` adds the stage table and the `venue_arrival` operation / `departed_center` transport-status values. The legacy `arrived_at_center` status remains readable but is not emitted by this workflow. The root seed adds an idempotent open pickup stage without finalizing it or resetting existing progress.

Student and Center tables expose read-only transport status. Student status follows that Student's effective scans, from awaiting pickup through return to the Center. Center status follows explicit stage finalization, so individual Students can reach a checkpoint before the Center advances. The existing scoped queries supply these records without widening access. Status cells wait for a complete initial query snapshot, retain known labels during later synchronization gaps, and discard labels when the Edition/Center scope changes; base table rows remain visible.

## Volunteer yearly IDs

Enrollment allocates a stable `KALV-{year}-{sequence}` ID on the volunteer's Edition Membership under the Edition row lock. Reactivation and replay preserve existing IDs, independently of QR payloads. Each Edition's Volunteers table displays that membership's ID in a searchable Yearly ID column; missing IDs display a dash. It uses the existing Edition-scoped roster query, without a separate server projection or changes to the global Users table.

Historical volunteer memberships without an allocated ID display a dash in the roster; enrollment and reactivation preserve existing IDs.

## Release verification

`packages/e2e/helpers/kalakriti-release-fixture.ts` owns deterministic role and privacy fixtures. The Kalakriti Playwright suite proves Edition creation and linked-event ownership, assignment and Guardian paths, Center controls, Student and individual/group Entry registration, public schedule privacy, scoped exports, direct URL/API denial, dormant Guardian login denial, and concurrent quota and duplicate races.

Person QR display, yearly IDs, transport setup, and operation recording have dedicated coverage described above. The Event-day station has isolated live-Edition E2E coverage; camera results are simulated at the decoder boundary while UI, authorization, mutations, and persisted operations remain real. The suite also verifies explicit Center finalization, derived vehicle status, duplicate marks, stale-stage protection, and mobile modal persistence. The remaining operational stations are separate follow-up work.

The release gate is:

```bash
bun run check:types
bun run test:unit
bun run check
bun run check:unused
bun run test:e2e
```

The release is not ready if any cross-Edition, cross-Center, out-of-scope, public-privacy, dormant-session, or later-phase-exposure check lacks passing evidence.
