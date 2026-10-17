# Pi-dash Domain Language

The canonical terms for the Kalakriti and Finance contexts, used alike in schema, code, UI and tests.

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
A contest definition with its eligibility and group rules.
_Avoid_: Event, activity

**Competition Division**:
An edition-owned Competition and Age Category pairing that owns capacity, Entries, and Result ranking.
_Avoid_: Competition Session, event category

**Competition Session**:
The scheduled time and Venue for one Competition Division.
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
A Center's registration in a Competition Division, containing either one Student or a same-Center group of Students.
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
The versioned winner and runner-up decision for a Competition Division, published only after approval.
_Avoid_: Score, judging sheet

**Scoresheet Set**:
An ordered, versioned collection of images or a multi-page PDF supporting a draft Result.
_Avoid_: Result attachment

**Inventory Movement**:
An immutable edition-owned purchase, dispatch, return, adjustment, or reversal that changes an Inventory Item's derived balance.
_Avoid_: Stock edit, transaction edit

**Lifecycle State**:
The Edition's stage, which controls which operations are legal.
_Avoid_: Status when referring to registration controls or operational state

## Finance

**Party**:
One person or organisation the trust deals with, holding roles such as donor, sponsor, intermediary or vendor.
_Avoid_: Donor record, contact, customer

**Contribution**:
A gift from a Party into an Organisation account, or in kind, with its channel, fund, donation type and Form 113 reporting mode.
_Avoid_: Payment, transaction, other income

**Programme**:
The top-level unit of work by cause that carries money, optionally split into time-boxed Projects.
_Avoid_: Team, cost centre

**Fund**:
The pot an entry belongs to, such as the default General Fund (Domestic) or the restricted Corpus Fund.
_Avoid_: Account, programme

**Account head**:
A line in the chart of accounts typed income, expense, asset, liability or fund; each expense category maps to its own head.
_Avoid_: Category, expense category, ledger

**Organisation account**:
A place the trust's money sits: a bank, cash, gateway clearing or fixed deposit account.
_Avoid_: Bank account when the kind is not bank, a claimant's saved bank account

**Clearing account**:
A gateway clearing Organisation account where Razorpay or give.do gifts wait until a Settlement pays them out to the bank.
_Avoid_: Razorpay account, bank account

**Posting**:
One source action written to the books, idempotent on source, revision and action, holding Ledger entries and Account movements.
_Avoid_: Journal entry, transaction

**Ledger entry**:
A recognition-book line: an income, expense, asset, liability or fund effect against an Account head, Fund and Programme.
_Avoid_: Movement, journal line

**Account movement**:
A cash-book line: money into or out of one Organisation account on a bank value date. Never summed with Ledger entries.
_Avoid_: Transaction, entry, statement line

**Movement allocation**:
The append-only link from an Account movement to the Statement line that reconciles it.
_Avoid_: Statement allocation, match

**Reversal**:
A Posting that flips every effect and direction of an earlier one; the only way to correct the books.
_Avoid_: Edit, delete, adjustment

**Waiting to post**:
A source that should be in the books but cannot post yet, with a reason such as a closed year or a missing bank account.
_Avoid_: Pending, failed

**Settlement**:
A gateway's final payout of a batch of gifts and refunds from a Clearing account, with net amount and UTR.
_Avoid_: Payout, transfer

**Statement line**:
One row of an imported bank statement, matched to what it paid or received.
_Avoid_: Transaction, Account movement

**Statement allocation**:
A reviewer's releasable link from a debit Statement line to the reimbursement, vendor payment, bank charge or tax payment it paid.
_Avoid_: Movement allocation, posting

**Charged to**:
The work an expense served: an event, a Programme (with optional Project) or the organisation, shown as "Admin".
_Avoid_: Expense category, Account head, cost centre

**Donation receipt**:
A numbered receipt the dashboard issues for a direct gift, with an 80G line when the donor qualifies.
_Avoid_: Form 114 certificate, Razorpay or give.do receipt

**Donations return**:
The yearly Form 113 filing of received gifts by donor, from which the portal generates Form 114 certificates.
_Avoid_: 10BD, receipts
