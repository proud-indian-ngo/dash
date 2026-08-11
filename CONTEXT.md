# Pi-dash Domain Language

This file records the canonical language for pi-dash business contexts. It currently defines the Kalakriti context so its rewrite uses one vocabulary across schema, code, UI, and tests.

## Kalakriti

**Edition**:
A single yearly occurrence of Kalakriti, owning its configuration, access, registrations, operations, and results.
_Avoid_: Year, season, tenant

**Event**:
The normal pi-dash team event linked one-to-one to an Edition for central volunteer participation and shared finance integrations.
_Avoid_: Using event for a Kalakriti competition

**Competition Category**:
An edition-owned grouping of related Competitions overseen by assigned Category Leads.
_Avoid_: Event category

**Competition**:
A contest definition containing its participation mode, gender eligibility, and group rules.
_Avoid_: Event, activity

**Competition Session**:
The scheduled occurrence of a Competition for one Age Category, with a time, venue, and capacity.
_Avoid_: Event slot, schedule event

**Student**:
An edition-owned child registered through a Center and eligible for Competition Entries.
_Avoid_: Participant, user

**Center**:
An edition-owned organization responsible for a yearly Student roster and Competition Entries.
_Avoid_: Branch, school

**Age Category**:
An edition-owned age range used to derive Student eligibility on the Edition's cutoff date.
_Avoid_: Age group

**Edition Membership**:
A yearly access relationship between an Edition and a login identity, representing either a central volunteer or an external Guardian.
_Avoid_: Event member, role

**Responsibility Assignment**:
A fixed, code-defined responsibility granted to an Edition Membership, optionally scoped to a Center, Competition Category, Competition, or operational team.
_Avoid_: Custom role, permission group

**Guardian**:
An invitation-only external login identity with yearly access to assigned Centers.
_Avoid_: Parent account, center user

**External Identity**:
A reusable Better Auth login marked as outside the central volunteer pool, with no Kalakriti authority unless it has an active Edition Membership.
_Avoid_: Guardian record, yearly user

**Dormant External Identity**:
An External Identity with no active Edition Membership, retained for exact-email reuse but blocked from signing in.
_Avoid_: Deleted user, inactive volunteer

**Liaison**:
A central volunteer assigned yearly to one or more Centers to help manage registration and transport checkpoints.
_Avoid_: Guardian, center coordinator

**Competition Entry**:
A Center's registration in a Competition Session, containing either one Student or a same-Center group of Students.
_Avoid_: Participation, nomination

**Entry Member**:
A Student belonging to a Competition Entry and tracked individually for attendance and prize distribution.
_Avoid_: Group participant

**Credential**:
An edition-bound opaque QR identity plus a human-readable ID used to resolve a Student or assigned person during operations.
_Avoid_: Raw person QR, permanent ID

**Operation**:
An idempotent event-day record such as pickup, check-in, meal service, attendance, departure, or drop-off.
_Avoid_: Toggle, scan state

**Result**:
The versioned winner and runner-up decision for a Competition Session, published only after approval.
_Avoid_: Score, judging sheet

**Scoresheet Set**:
An ordered, versioned collection of images or a multi-page PDF supporting a draft Result.
_Avoid_: Result attachment

**Inventory Movement**:
An immutable edition-owned purchase, dispatch, return, adjustment, or reversal that changes an Inventory Item's derived balance.
_Avoid_: Stock edit, transaction edit

**Lifecycle State**:
One of `draft`, `registration_open`, `registration_locked`, `live`, or `archived`, controlling which Edition operations are legal.
_Avoid_: Status when referring to registration controls or operational state
