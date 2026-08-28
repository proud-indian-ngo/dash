# Kalakriti Event Day

> **Load when**: Credentials, transport setup, event-day operations, corrections, go-live, or station authorization.
> **Related**: `kalakriti-registration.md`, `data-layer.md`, `authorization.md`, `notifications.md`, `pdf.md`

## Boundary

Event-day Phase 2 covers online-only operations for Students and Edition volunteers. Judges, Guests, `kalakriti_person`, offline queues, Results, Awards, and Inventory stay out of scope.

Print, lookup, transport assignment setup, and credential issue/reissue remain available from `draft` through `registration_locked` and `live`. Forward operations (`record`, `recordManual`, `correct`) require `lifecycle === "live"`.

## Credentials

- A Credential belongs to exactly one Student or one active volunteer membership.
- QR tokens are never stored plaintext; only SHA-256 hashes persist in PostgreSQL.
- Print and reissue always revoke the prior active row and issue a new token. UI must state that previous cards stop working.
- Guardians never receive Credentials.

Entry points: `kalakritiCredential.reissue`, `POST /api/kalakriti/$year/credentials/print`, credential lookup route, `/kalakriti/$year/credentials`.

## Operations

Immutable `kalakriti_operation` rows are append-only. Client-generated `operationId` values are unique; replay returns the existing row without mutation.

Supported types: `pickup`, `venue_departure`, `drop_off`, `volunteer_check_in`, `breakfast`, `lunch`, `competition_attendance`.

Pure rules live in `packages/zero/src/kalakriti-operation-rules.ts`:

- transport order: pickup → venue departure → drop-off;
- meals require effective pickup (Students) or check-in (volunteers);
- competition attendance requires effective pickup and a session;
- superseded rows (`supersededByOperationId` set) are ignored for derived eligibility.

Mutators: `kalakritiOperation.record` (QR token), `kalakritiOperation.recordManual` (yearly ID), `kalakritiOperation.correct` (lead/admin only).

### Corrections

`kalakritiOperation.correct` inserts a replacement row copying the target type/subject/session, stores `correctionReason` on the new row, and sets `target.supersededByOperationId` to the replacement id. History is never deleted.

Authorization is stricter than recording:

| Operation family | Can correct |
| --- | --- |
| pickup / venue_departure / drop_off | transport_lead, transport_coordinator (Student Center), edition_admin, `kalakriti.admin` |
| volunteer_check_in | hospitality_lead, edition_admin, `kalakriti.admin` |
| breakfast / lunch | food_lead, edition_admin, `kalakriti.admin` |
| competition_attendance | competition_coordinator (Competition scope), edition_admin, `kalakriti.admin` |

Food members, hospitality members, competition volunteers, and liaison volunteers cannot correct.

Kalakriti audit action `corrected` stores the reason in the `reason` column. Metadata is `{ type, targetOperationId }` only; central `audit_log` metadata never includes free-text reasons.

Correcting a pickup inserts a new effective pickup, so meal eligibility is restored immediately. Superseding a pickup without a replacement row would make the Student derived-absent again.

## Transport setup

Center transport assignments and forward-only status transitions live under `kalakritiTransport.*`. Guardians cannot create or transition transport. Bus or driver changes enqueue `notify-kalakriti-transport-changed` for affected Center Guardians and Liaisons.

`everyActiveCenterHasTransportAssignment()` in `packages/zero/src/kalakriti-transport-rules.ts` is a go-live blocker.

## Stations UI

`/kalakriti/$year/event-day` exposes online-only station modes (transport, check-in, meals, attendance). Access is derived from Edition assignments in `apps/web/src/lib/kalakriti-event-day-policy.ts`. Leads see a correction panel; ordinary station members do not.

There is no offline queue or service-worker replay.

## Go-live

Lifecycle edge: `registration_locked` → `live` only. PostgreSQL enforces one live Edition via `kalakriti_edition_single_live_uidx`.

Blockers (`packages/zero/src/kalakriti-go-live-readiness.ts`):

- Edition is `registration_locked`;
- every Center has both registration controls disabled;
- registration readiness (sessions, competitions, venues, age categories, etc.);
- assignments for `overall_events_lead`, `transport_lead`, and `food_lead`;
- every non-retired Center has ≥1 transport assignment;
- every Student and every active volunteer membership has an active Credential.

`kalakritiEdition.transition` with `targetLifecycle: "live"` checks blockers, sets lifecycle to `live`, and write-confirms both Center controls false in the same transaction.

Overview UI (`edition-lifecycle-card.tsx`) exposes **Go live** for Edition administrators when locked and ready.

## Verification

```bash
bun run check:types
bun run test:unit
bun run check
bun run check:unused
cd packages/e2e && bash run-e2e.sh tests/kalakriti/lifecycle-golive.spec.ts
```

Evidence matrix: `docs/kalakriti-event-day-phase2-evidence.md`.
