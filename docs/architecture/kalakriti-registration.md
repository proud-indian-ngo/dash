# Kalakriti Registration

> **Load when**: Kalakriti Edition access, Guardian identity, Center controls, eligibility, Competition configuration, Student or Entry registration, public schedule, registration dashboards, audit, or exports.
> **Related**: `data-layer.md`, `auth.md`, `authorization.md`, `notifications.md`, `jobs.md`, `e2e-testing.md`

## Boundary

Kalakriti is a native Edition-bound module under `/kalakriti/:year`. Better Auth remains the only login system and central volunteers remain normal `user` records, but every Kalakriti business row belongs to one `kalakritiEdition`. A linked `teamEvent` exposes the Edition to shared event, reimbursement, and vendor-payment workflows without making the generic event domain authoritative for Kalakriti state.

The Registration Release stops at `registration_locked`. Event-day, transport, attendance, meals, results, awards, scoresheets, and inventory have no production route, query, or mutator until their later release gates are implemented.

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

A Competition may set `musicUploadEnabled`. While Center Entry registration is open, Guardians, Liaisons, Edition administrators, and global `kalakriti.admin` users may optionally attach one audio file to an Entry (one file per individual Student, one file per group). The flag is not eligibility: it can change after Entries exist until the Edition is structurally locked. Turning it off blocks new claims; existing files stay downloadable until removed in the same write window. Anyone whose registration scope covers the Entry, including Overall Events Leads, Category Leads, and Competition Coordinators, may download. Public schedule and registration export never include music keys, filenames, or binaries.

## Public and server-only projections

Every authorized viewer of a volunteer, Guardian, or Student detail sheet sees that person's identifier QR through `components/kalakriti/person-qr-panel.tsx`. The browser renders JSON directly from already-scoped row data: `{"id":"<database-id>","type":"student|guardian|volunteer"}`. `id` is the Student record ID for Students and the Edition Membership record ID for Guardians and volunteers; it never uses the yearly display ID. There is no issuance, replacement, secret token, or additional admin gate for these QRs. Opening a sheet never writes credential records.

Guardian sheets show assigned Centers; Student sheets show their Center and registered individual/group competitions, including cancellation status. There is no standalone Credentials page or navigation item. Existing page and query scopes still determine whose details a viewer can access; QR visibility does not make personal records public.

`GET /api/kalakriti/:year/people/lookup?humanId=` accepts the existing yearly or record identifier and returns allowlisted Student, volunteer, or Guardian details without requiring a credential row. The lookup retains its administrator gate and Edition boundary. Scanners parse the JSON and use its `id` to look up the subject, then verify that the stored subject kind matches `type`. An identifier QR is not proof of identity or permission: scanner commands must authorize the operator and validate subject eligibility independently.

The legacy credential table, token hashing, issuance/reissue mutators, and PDF card printing are removed. JSON QR display and person lookup depend only on Student and Edition Membership records. The person-QR E2E suite covers decoded payloads, stable display, scoped nonadmin visibility, and lookup; former credential routes return 404. The [phase 2 task breakdown](../kalakriti-event-day-phase2-tasks.md) records the scanner integration boundary for later stacked PRs.

`/api/kalakriti/:year/schedule` is unauthenticated and returns an explicit allowlist: Edition display fields plus Competition, Age Category, Venue, time, and cancellation status. It never returns staffing, contacts, Students, submissions, evidence, music files, or `musicUploadEnabled`.

Registration dashboards and `/api/kalakriti/:year/registration-export` resolve the actor and Edition on the server. The export route builds an allowlisted ZIP on the server, returns it as a private non-cacheable attachment, neutralizes spreadsheet formulas, and never sends raw registration rows to the browser. CSV import is intentionally unavailable.

Audit reads apply Edition and responsibility scopes before returning privacy-safe metadata. Mutation audit entries remain Edition-owned and record the actor, domain, action, target, timestamp, reason where required, and structured metadata.

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

`docs/kalakriti-registration-release-evidence.md` is the acceptance traceability record for KRR-001 through KRR-019. Person QR display, yearly IDs, and lookup have dedicated coverage described above; transport and operational dependencies remain later modules on this branch.

The release gate is:

```bash
bun run check:types
bun run test:unit
bun run check
bun run check:unused
bun run test:e2e
```

The release is not ready if any cross-Edition, cross-Center, out-of-scope, public-privacy, dormant-session, or later-phase-exposure check lacks passing evidence.
