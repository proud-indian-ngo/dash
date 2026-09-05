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
- Volunteer Coordinators manage the volunteer roster and assignments on `/kalakriti/:year/volunteers`. That page owns roster membership, not Overview. **Add volunteers** puts people on the roster with no role (Unassigned). **Assign role** on a row or detail sheet grants a responsibility. Unoriented volunteers may sit Unassigned; assignment still rejects `unoriented_volunteer`. Removing the last role leaves them Unassigned with linked-event access. **Remove from Edition** archives membership and drops the linked event member.
- Overall Events Leads and Category Leads receive Competition-category scopes. Lead roles are multi-occupant; assignment uniqueness is per person plus scope, not one occupant per Edition.
- Liaisons and Guardians receive explicit Center scopes. Overall Liaison Lead is Edition-wide: no Center picker, and the assignment covers every Center. Center Liaison Lead and Liaison Volunteer are per Center.
- Unassigned volunteer membership is a valid roster state. Edition **access stays fail-closed**: opening the Kalakriti shell still requires Guardian membership, at least one assignment, or global admin. Unassigned volunteers appear on the Volunteers page only.

Signup via `/register?eventId=` on the linked event, coordinator **Add volunteers**, and **approved public interest** on a Kalakriti-linked event all create the same destination: active unassigned volunteer membership plus `team_event_member` on the linked event.

Linked event details are editable from `/events/$id` (name, location, description, schedule, notifications) for `events.edit` / team lead or `kalakriti.admin` / Edition administrator. Generic event volunteer add/remove, cancel, and `isPublic` stay off that page; `isPublic` stays lifecycle-driven. Recurrence and inherit-volunteers do not apply to Edition events.

Edition Membership snapshots remain as historical records after a central user is deleted: the membership's `userId` and creator attribution become null rather than blocking account deletion or erasing the membership. Guardians use the technical `external_user` role and a persistent `kalakritiExternalIdentity` marker. Their yearly profile and access live in Edition Memberships. Edition administrators and global administrators can update an active Guardian's yearly name, email, and phone; dedicated external identities also update login email and phone, while assigned central volunteer accounts keep their login email. Archiving the final active Guardian membership bans the external account and revokes its sessions; exact-email reuse can reactivate the identity for a later Edition. External identities are excluded from central user lists and volunteer pickers. **Assign role** uses an oriented-only picker on a locked row; **Add volunteers** includes `unoriented_volunteer` and excludes people already on the roster. Assigned members can open their Edition even when their global role lacks `kalakriti.view`.

`apps/web/src/lib/server/kalakriti-edition-access.ts` resolves Edition access. `apps/web/src/lib/kalakriti-registration-scope-policy.ts` converts that access into the canonical registration scopes shared by dashboards and exports. Commands and Zero queries perform their own Edition and assignment checks; hidden navigation is never treated as authorization.

## Data and command ownership

The Drizzle schema is grouped in `packages/db/src/schema/kalakriti.ts`. Registration commands and queries live under `packages/zero/src/mutators/kalakriti-*` and `packages/zero/src/queries/kalakriti-*`; pure registration rules remain in focused `packages/zero/src/kalakriti-*` modules.

Every sensitive join repeats `editionId`, and composite foreign keys prevent a Center, Age Category, Competition Division, Session, Student, Entry, or Assignment from crossing Edition boundaries. A Competition Division pairs one Competition with one Age Category and owns Entries and future Result ranking; a Competition Session only assigns that Division a time and Venue. PostgreSQL row locks serialize quota, Student-ID sequence, and lifecycle decisions. Unique indexes back duplicate Membership, one-Student-per-Division, one Session per Division, one active Credential, and one live Edition invariants. Assignment uniqueness is per person plus scope; lead roles including Overall Events Lead may be held by more than one volunteer.

The lifecycle edges exposed by this release are:

```text
draft -> registration_open <-> registration_locked
```

Opening or reopening requires a complete readiness snapshot. Center Student and Entry controls are independent, bulk lock closes both controls for every Center, and every explicit reopen is audited. Registration commands require both an open Edition lifecycle and the relevant Center control. Closing Center participation registration requires every participating Student to meet the Edition `minTotalCompetitions` floor; Students with no Entries remain non-participants.

A Competition may set `musicUploadEnabled`. While Center Entry registration is open, Guardians, Liaisons, Edition administrators, and global `kalakriti.admin` users may optionally attach one audio file to an Entry (one file per individual Student, one file per group). The flag is not eligibility: it can change after Entries exist until the Edition is structurally locked. Turning it off blocks new claims; existing files stay downloadable until removed in the same write window. Anyone whose registration scope covers the Entry, including Overall Events Leads, Category Leads, and Competition Coordinators, may download. Public schedule and registration export never include music keys, filenames, or binaries.

## Public and server-only projections

Edition and global administrators manage Student and volunteer cards on `/kalakriti/:year/credentials`. `apps/web/src/functions/kalakriti-credentials.ts` lists allowlisted credential fields through `apps/web/src/lib/server/kalakriti-credential.ts`; `credentials-table.tsx` also shows active volunteers awaiting their first card. Enrollment assigns volunteers stable `KALV-{year}-{sequence}` IDs. Removing a volunteer revokes their card, and reactivation preserves their yearly ID.

Credential lookup and print use `/api/kalakriti/:year/credentials/{lookup,print}`. Printing rotates the QR hash and renders the PDF inside the transaction, so rendering failures preserve existing cards. `packages/pdf/src/generate-kalakriti-credential.ts` and `kalakriti-credential-card.tsx` own rendering; the browser never receives stored token hashes. `packages/e2e/helpers/kalakriti-credentials.ts` and `tests/kalakriti/credential-print.spec.ts` cover issuance, lookup, printing, validation, and rollback. The [phase 2 task breakdown](../kalakriti-event-day-phase2-tasks.md) tracks later event-day work.

`/api/kalakriti/:year/schedule` is unauthenticated and returns an explicit allowlist: Edition display fields plus Competition, Age Category, Venue, time, and cancellation status. It never returns staffing, contacts, Students, submissions, evidence, music files, or `musicUploadEnabled`.

Registration dashboards and `/api/kalakriti/:year/registration-export` resolve the actor and Edition on the server. The export route builds an allowlisted ZIP on the server, returns it as a private non-cacheable attachment, neutralizes spreadsheet formulas, and never sends raw registration rows to the browser. CSV import is intentionally unavailable.

Audit reads apply Edition and responsibility scopes before returning privacy-safe metadata. Mutation audit entries remain Edition-owned and record the actor, domain, action, target, timestamp, reason where required, and structured metadata.

## Release verification

`packages/e2e/helpers/kalakriti-release-fixture.ts` owns deterministic role and privacy fixtures. The Kalakriti Playwright suite proves Edition creation and linked-event ownership, assignment and Guardian paths, Center controls, Student and individual/group Entry registration, public schedule privacy, scoped exports, direct URL/API denial, dormant Guardian login denial, and concurrent quota and duplicate races.

`docs/kalakriti-registration-release-evidence.md` is the acceptance traceability record for KRR-001 through KRR-019. Credential reissue, print, and lookup now have dedicated coverage described above; transport and operational dependencies remain later modules on this branch.

The release gate is:

```bash
bun run check:types
bun run test:unit
bun run check
bun run check:unused
bun run test:e2e
```

The release is not ready if any cross-Edition, cross-Center, out-of-scope, public-privacy, dormant-session, or later-phase-exposure check lacks passing evidence.
