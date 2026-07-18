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
- Volunteer Coordinators manage central-volunteer assignments.
- Overall Events Leads and Category Leads receive Competition-category scopes.
- Liaisons and Guardians receive explicit Center scopes.
- Unassigned volunteers fail closed even if their global role can see the Kalakriti shell.

Guardians use the technical `external_user` role and a persistent `kalakritiExternalIdentity` marker. Their yearly profile and access live in Edition Memberships. Archiving the final active Guardian membership bans the external account and revokes its sessions; exact-email reuse can reactivate the identity for a later Edition. External identities are excluded from central user lists and volunteer pickers.

`apps/web/src/lib/server/kalakriti-edition-access.ts` resolves Edition access. `apps/web/src/lib/kalakriti-registration-scope-policy.ts` converts that access into the canonical registration scopes shared by dashboards and exports. Commands and Zero queries perform their own Edition and assignment checks; hidden navigation is never treated as authorization.

## Data and command ownership

The Drizzle schema is grouped in `packages/db/src/schema/kalakriti.ts`. Registration commands and queries live under `packages/zero/src/mutators/kalakriti-*` and `packages/zero/src/queries/kalakriti-*`; pure registration rules remain in focused `packages/zero/src/kalakriti-*` modules.

Every sensitive join repeats `editionId`, and composite foreign keys prevent a Center, Age Category, Session, Student, Entry, or Assignment from crossing Edition boundaries. PostgreSQL row locks serialize quota, Student-ID sequence, Session-capacity, and lifecycle decisions. Unique indexes back duplicate Membership, one-Student-per-Session, one active Credential, and one live Edition invariants.

The lifecycle edges exposed by this release are:

```text
draft -> registration_open <-> registration_locked
```

Opening or reopening requires a complete readiness snapshot. Center Student and Entry controls are independent, bulk lock closes both controls for every Center, and every explicit reopen is audited. Registration commands require both an open Edition lifecycle and the relevant Center control.

## Public and server-only projections

`/api/kalakriti/:year/schedule` is unauthenticated and returns an explicit allowlist: Edition display fields plus Competition, Age Category, Venue, time, and cancellation status. It never returns capacity, staffing, contacts, Students, submissions, or evidence.

Registration dashboards and `/api/kalakriti/:year/registration-export` resolve the actor and Edition on the server. The export route builds an allowlisted ZIP on the server, returns it as a private non-cacheable attachment, neutralizes spreadsheet formulas, and never sends raw registration rows to the browser. CSV import is intentionally unavailable.

Audit reads apply Edition and responsibility scopes before returning privacy-safe metadata. Mutation audit entries remain Edition-owned and record the actor, domain, action, target, timestamp, reason where required, and structured metadata.

## Release verification

`packages/e2e/helpers/kalakriti-release-fixture.ts` owns deterministic role and privacy fixtures. The Kalakriti Playwright suite proves Edition creation and linked-event ownership, assignment and Guardian paths, Center controls, Student and individual/group Entry registration, public schedule privacy, scoped exports, direct URL/API denial, dormant Guardian login denial, and concurrent quota/capacity/duplicate races.

The release gate is:

```bash
bun run check:types
bun run test:unit
bun run check
bun run check:unused
bun run test:e2e
```

The release is not ready if any cross-Edition, cross-Center, out-of-scope, public-privacy, dormant-session, or later-phase-exposure check lacks passing evidence.
