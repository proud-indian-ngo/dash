# Kalakriti Registration

> **Load when**: Kalakriti Edition access, Guardian identity, Center controls, eligibility, Competition configuration, Student or Entry registration, public schedule, registration dashboards, audit, or exports.
> **Related**: `data-layer.md`, `auth.md`, `authorization.md`, `notifications.md`, `jobs.md`, `e2e-testing.md`

## Boundary

Kalakriti is a native Edition-bound module under `/kalakriti/:year`. Better Auth remains the only login system and central volunteers remain normal `user` records, but every Kalakriti business row belongs to one `kalakritiEdition`. A linked `teamEvent` exposes the Edition to shared event, reimbursement, and vendor-payment workflows without making the generic event domain authoritative for Kalakriti state.

The registration UI stops at `registration_locked`. The event-day operation backend supports recording only in `live` Editions; there is no station UI or go-live action on this branch. Center transport setup and forward status tracking are available in nonarchived Editions. Results, awards, scoresheets, and inventory remain behind later release gates.

## Identity and access

Global permissions provide the coarse module gates `kalakriti.view` and `kalakriti.admin`. Operational authority is resolved from an active Edition Membership plus typed Responsibility Assignments; responsibilities never become global roles.

- Global administrators can access every Edition, including archived Editions.
- Edition administrators manage the complete active Edition.
- Volunteer Coordinators manage the volunteer roster and assignments on `/kalakriti/:year/volunteers`. That page owns roster membership, not Overview. **Add volunteers** puts people on the roster with no role (Unassigned). **Assign role** on a row or detail sheet grants a responsibility. Successful enrollment automatically changes `unoriented_volunteer` to the oriented `volunteer` role; admin and custom roles remain unchanged. Removing the last role leaves them Unassigned with linked-event access. **Remove from Edition** archives membership and drops the linked event member.
- Overall Events Leads and Category Leads receive Competition-category scopes. Lead roles are multi-occupant; assignment uniqueness is per person plus scope, not one occupant per Edition.
- Liaisons and Guardians receive explicit Center scopes. Overall Liaison Lead is Edition-wide: no Center picker, and the assignment covers every Center. Center Liaison Lead and Liaison Volunteer are per Center.
- Unassigned volunteer membership is a valid roster state. Edition **access stays fail-closed**: opening the Kalakriti shell still requires Guardian membership, at least one assignment, or global admin. Unassigned volunteers appear on the Volunteers page only.

Signup via `/register?eventId=` on the linked event, coordinator **Add volunteers**, and **approved public interest** on a Kalakriti-linked event all create the same destination: active unassigned volunteer membership plus `team_event_member` on the linked event. Direct responsibility assignments at every scope apply the same orientation policy, including reactivation and replay of existing active membership. Edition creation doesn't enroll its creator, so creation alone doesn't promote anyone. Pending interest, rejected enrollment, unrelated events, and Guardian or external identities never trigger promotion. Removing a responsibility or membership never demotes the global role.

`packages/db/src/kalakriti-orientation.ts` owns the conditional SQL update: only the persisted `unoriented_volunteer` role with active volunteer membership in a non-archived Edition qualifies. The update and session revocation run inside the enrollment transaction, so failure rolls both back and a concurrent role change isn't overwritten. After commit, callers invalidate the role-permission caches and enqueue the established role-change notification and orientation WhatsApp jobs only when the update changed a row. Zero commands remain inside the central mutation audit boundary; unauthenticated signup remains excluded.

Linked event details are editable from `/events/$id` (name, location, description, schedule, notifications) for `events.edit` / team lead or `kalakriti.admin` / Edition administrator. Generic event volunteer add/remove, cancel, and `isPublic` stay off that page; `isPublic` stays lifecycle-driven. Recurrence and inherit-volunteers do not apply to Edition events.

Edition Membership snapshots remain as historical records after a central user is deleted: the membership's `userId` and creator attribution become null rather than blocking account deletion or erasing the membership. Guardians use the technical `external_user` role and a persistent `kalakritiExternalIdentity` marker. Their yearly profile and access live in Edition Memberships. Edition administrators and global administrators can update an active Guardian's yearly name, email, and phone; dedicated external identities also update login email and phone, while assigned central volunteer accounts keep their login email. Archiving the final active Guardian membership bans the external account and revokes its sessions; exact-email reuse can reactivate the identity for a later Edition. External identities are excluded from central user lists and volunteer pickers. **Assign role** and scoped responsibility pickers include `unoriented_volunteer`, because successful assignment promotes them. **Add volunteers** also includes them and excludes people already on the roster. Assigned members can open their Edition even when their global role lacks `kalakriti.view`.

`apps/web/src/lib/server/kalakriti-edition-access.ts` resolves Edition access. `apps/web/src/lib/kalakriti-registration-scope-policy.ts` converts that access into the canonical registration scopes shared by dashboards and exports. Commands and Zero queries perform their own Edition and assignment checks; hidden navigation is never treated as authorization.

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

Quiesce application writes and stop old application instances before the backfill and application cutover. Old singleton writers aren't compatible with the child-only music model. Against the configured database, run:

```bash
bun --env-file=.env scripts/backfill-kalakriti-entry-music.ts --dry-run
bun --env-file=.env scripts/backfill-kalakriti-entry-music.ts --apply
bun --env-file=.env scripts/backfill-kalakriti-entry-music.ts --dry-run
```

The script reuses the Entry's UUID for its first music row, preserves the exact object key and all file/upload metadata, and never contacts R2 or moves bytes. Under Edition and Entry locks, each successful insert clears the legacy singleton columns in the same transaction, so rerunning the backfill cannot resurrect a subsequently removed file. It includes historical Entries and archived Editions. Malformed or conflicting rows remain untouched and appear as `malformedIds`; the CLI exits nonzero until they are repaired.

Review the first dry-run, repair every reported row, apply, then require the final dry-run to report `candidates: 0`, `updated: 0`, and an empty `malformedIds` array before enabling traffic. Remote targets require `--confirm-target=host:port/database` even for dry-run. Deploy the matching application and generated Zero schema together, and retain the existing music temporary-object expiry rule. After cutover, verify both backfilled and new files through protected playback/download; rolling back to singleton-only code requires a deliberate data conversion and cannot preserve two files per Entry automatically.

## Public and server-only projections

Every authorized viewer of a volunteer, Guardian, or Student detail sheet sees that person's identifier QR through `components/kalakriti/person-qr-panel.tsx`. The browser renders JSON directly from already-scoped row data: `{"id":"<database-id>","type":"student|guardian|volunteer"}`. `id` is the Student record ID for Students and the Edition Membership record ID for Guardians and volunteers; it never uses the yearly display ID. There is no issuance, replacement, secret token, or additional admin gate for these QRs. Opening a sheet never writes credential records.

Guardian sheets show assigned Centers; Student sheets show their Center and registered individual/group competitions, including cancellation status. There is no standalone Credentials page or navigation item. Existing page and query scopes still determine whose details a viewer can access; QR visibility does not make personal records public.

`GET /api/kalakriti/:year/people/lookup?humanId=` accepts the existing yearly or record identifier and returns allowlisted Student, volunteer, or Guardian details without requiring a credential row. The lookup retains its administrator gate and Edition boundary. Scanners parse the JSON and use its `id` to look up the subject, then verify that the stored subject kind matches `type`. An identifier QR is not proof of identity or permission: scanner commands must authorize the operator and validate subject eligibility independently.

The legacy credential table, token hashing, issuance/reissue mutators, and PDF card printing are removed. JSON QR display and person lookup depend only on Student and Edition Membership records. The person-QR E2E suite covers decoded payloads, stable display, scoped nonadmin visibility, and lookup; former credential routes return 404. The [phase 2 task breakdown](../kalakriti-event-day-phase2-tasks.md) records the scanner integration boundary for later stacked PRs.

`/api/kalakriti/:year/schedule` is unauthenticated and returns an explicit allowlist: Edition display fields plus Competition, Age Category, Venue, time, and cancellation status. It never returns staffing, contacts, Students, submissions, evidence, music files, or `musicUploadEnabled`.

Registration dashboards and `/api/kalakriti/:year/registration-export` resolve the actor and Edition on the server. The export route builds an allowlisted ZIP on the server, returns it as a private non-cacheable attachment, neutralizes spreadsheet formulas, and never sends raw registration rows to the browser. CSV import is intentionally unavailable.

Audit reads apply Edition and responsibility scopes before returning privacy-safe metadata. Mutation audit entries remain Edition-owned and record the actor, domain, action, target, timestamp, reason where required, and structured metadata.

## Center transport

Center detail pages expose vehicle assignments with capacity, driver contact fields, and notes. `kalakritiTransport.create`, `update`, and `delete` serialize writes through Edition and Center row locks, reject archived Editions and retired Centers, and audit the commands. Deletion requires confirmation and sets `deletedAt`, preserving the assignment and its history while excluding it from active lists, readiness checks, and pending notifications. Individual vehicle status is read-only. Completing a Center scan stage transactionally projects the derived status to every non-deleted vehicle at that Center and appends status history. Vehicles created later inherit the latest finalized Center status.

The Edition's Transport Lead and global/Edition administrators manage transport Edition-wide. There is no per-Center transport role. Center-scoped Liaisons and Guardians can read their own Center's transport details but cannot create, edit, or delete vehicle assignments. Authorized Center Liaisons can scan Students and finalize Center stages; Guardians cannot. Transport Leads can discover all Edition Centers without gaining Student or Entry registration-write permissions. Assign the Transport Lead through the normal Edition-scoped volunteer assignment workflow.

Vehicle/driver field updates enqueue `notify-kalakriti-transport-changed` after commit with a deterministic assignment/change key. Recipients are the affected Center's active Guardians and Liaisons; transport details are not public schedule data. The root seed creates one planned demo vehicle and its initial history atomically and idempotently, without changing progressed vehicles or archived Editions.

## Event-day operation spine

`packages/zero/src/mutators/kalakriti-operation.ts` owns server-authoritative recording; the client phase performs no optimistic writes. `record` accepts `personQr`, a bounded JSON string containing exactly `{ id, type }`, matching the detail-sheet QR format. It resolves the persisted Student or active volunteer membership inside the requested Edition and rejects Guardian subjects and mismatched types. `recordManual` resolves an Edition yearly ID through the same subject and operation rules; neither path uses credential storage or token hashes.

New writes require a `live` Edition and an authorized operator. Edition/global administrators can record all types; other staff are restricted by operation type and their Center or Competition assignment. Attendance additionally requires a valid in-Edition session and the Student's registration in its Division. Transport ordering, volunteer check-in, and meal eligibility are enforced independently of QR possession.

`kalakriti_operation` is append-only and has a unique `operationId`, XOR subjects, and Edition-composite subject/session references. A retry by the original recorder or global administrator is a no-op even if the submitted type or subject changes; another recorder or Edition cannot reuse the key. Replays don't create audit rows or duplicate operations. Student deletion and Entry removal are blocked once their Students have recorded operations. `event_day_operation` audit entries contain only bounded operation metadata. The seed script leaves draft Edition operations empty and adds an idempotent sample pickup only when the demo Edition is live and its sample Student has no history. E2E fixtures exercise idempotent recording against isolated live Editions.

## Role-aware scanning

The Kalakriti sidebar **Scan** button opens a shared modal, not a separate Event day page. Available activities are the union of the operator's active Edition assignments. Administrators see all activities; multiple activities appear as tabs, while single-activity staff do not need a tab selector.

| Activity | Authorized staff | Eligibility |
| --- | --- | --- |
| Transport | Global/Edition administrators, Transport Leads, scoped Center Liaisons | Center roster and current pinned stage |
| Volunteer check-in | Global/Edition administrators, Hospitality Leads/members | Active Edition volunteer |
| Meals | Global/Edition administrators, Food Leads/members | Student pickup or volunteer check-in; selected breakfast/lunch service |
| Attendance | Global/Edition administrators, assigned Competition Volunteers/Coordinators | Picked-up Student registered in the selected session's Division; valid, uncancelled in-Edition session |

The browser tabs are a convenience, not an authorization boundary. Every operation validates role, subject, Edition, eligibility, and session scope on the server. QR input uses person JSON and manual input uses yearly IDs; neither authorizes an operation. Changing scanning activity or session ends the previous camera context, and pending writes cannot change their operation arguments. Archived Editions expose no scanning, and new writes require a live Edition.

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

For existing volunteer memberships missing IDs, run the explicit backfill:

```bash
bun --env-file=.env scripts/backfill-kalakriti-volunteer-ids.ts --dry-run
bun --env-file=.env scripts/backfill-kalakriti-volunteer-ids.ts --apply
```

The script includes archived volunteer memberships and Editions, preserves every existing ID, and allocates missing IDs in creation/record-ID order under an Edition lock. Dry-run is the default; a second successful apply updates zero rows. Remote targets require `--confirm-target=host:port/database`, using the same target guard as the orientation backfill. It doesn't change roles, notify users, or create credentials.

## Orientation backfill

Run the idempotent backfill against the configured database to promote existing active volunteer memberships in non-archived Editions. Historical-only and archived memberships, deleted users, Guardians, external identities, and non-default roles are excluded.

```bash
bun run db:backfill-kalakriti-orientation --dry-run
bun run db:backfill-kalakriti-orientation --apply
```

The default is dry-run. The script reports a credential-free target and candidate count, rechecks eligibility in each conditional update, and revokes sessions in the same transaction. Apply first checks pg-boss availability in that same database through a producer-only connection; it doesn't start handlers, schedules, or schema migrations. The app must have initialized the queue schema before apply. Apply queues role-change and orientation jobs only for users it promoted; it doesn't create memberships or assignments. A second successful apply changes zero rows. Queue delivery happens after commit, so a queue failure doesn't roll back the role change; inspect the error before retrying delivery rather than expecting a no-op backfill to resend jobs.

Only loopback database hosts are accepted without `--confirm-target=host:port/database`. Remote targets require explicit operator confirmation even for dry-run; never apply to production without confirming the exact target. The CLI isn't an authenticated product command and doesn't fabricate an audit-ledger actor. Its structured log records the target and counts, not contact details.

## Release verification

`packages/e2e/helpers/kalakriti-release-fixture.ts` owns deterministic role and privacy fixtures. The Kalakriti Playwright suite proves Edition creation and linked-event ownership, assignment and Guardian paths, Center controls, Student and individual/group Entry registration, public schedule privacy, scoped exports, direct URL/API denial, dormant Guardian login denial, and concurrent quota and duplicate races.

`docs/kalakriti-registration-release-evidence.md` is the acceptance traceability record for KRR-001 through KRR-019. Person QR display, yearly IDs, transport setup, and operation recording have dedicated coverage described above. The Event-day station has isolated live-Edition E2E coverage; camera results are simulated at the decoder boundary while UI, authorization, mutations, and persisted operations remain real. The suite also verifies explicit Center finalization, derived vehicle status, duplicate marks, stale-stage protection, and mobile modal persistence. The remaining operational stations are separate follow-up work.

The release gate is:

```bash
bun run check:types
bun run test:unit
bun run check
bun run check:unused
bun run test:e2e
```

The release is not ready if any cross-Edition, cross-Center, out-of-scope, public-privacy, dormant-session, or later-phase-exposure check lacks passing evidence.
