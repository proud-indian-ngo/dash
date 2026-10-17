# Finance and programmes

> **Load when**: finance overview, programmes, projects, funds, main bank account, account heads, expense "Charged to", cost centres (City), approval policy, budgets, advance settlement, in-kind, FCRA and FC-4, retention.
> **Related**: `authorization.md`, `data-layer.md`, `jobs.md`, `reimbursements.md`, `vendor-payments.md`, `cash-vouchers.md`

The dashboard keeps the trust's operational financial record year-round, organised by programme: expenses, income, donors, receipts and a single-entry set of books. The CA keeps the statutory books and takes year-end exports from the dashboard. The ledger starts at the cutover, 1 April 2026.

| Chapter | Covers |
|---|---|
| This one | Status, decisions, dimensions, Charged to, cost centres, deferred work, data protection |
| [reimbursements.md](reimbursements.md) | Reimbursement lifecycle, payouts by bank or UPI, claim for others, advance payments, financial-year export |
| [finance-income.md](finance-income.md) | Donors, contributions and other income, CSV imports, Razorpay, give.do payouts, Reached bank |
| [finance-bank-statements.md](finance-bank-statements.md) | Bank statement lines, credit matching, debit matching and bank charges |
| [finance-books.md](finance-books.md) | Ledger tables, posting engine, opening balances, year close, book-keeping permissions, income and expense posting, audited figures, CA workbook |
| [finance-receipts-and-returns.md](finance-receipts-and-returns.md) | Donation receipts and numbering, donations return (Form 113/114) |
| [finance-ledger-cutover.md](finance-ledger-cutover.md) | Cutover date, opening balance figures, backfill, plain-language posting rules, CA questions, workbook columns |

## Status

| Layer | Scope | State |
|---|---|---|
| Phase 0 | Cutover contracts (`finance-ledger-cutover.md`) | Drafted; founder and CA sign-off pending |
| Phase 1 | Dimensions and cost centres, bigint paise, parties and private data, vendors as parties, programmes on teams and events, Charged to | Shipped |
| Phase 2 (2, 3a–3f) | Contributions and other income, CSV imports, Razorpay ingestion with refunds and settlements, bank statement lines, donations return readiness and export, give.do payouts, Reached bank | Shipped |
| Phase 3 (3-1 to 3-5) | Posting engine and books, income posting, expense posting, bank debit matching, CA workbook, audited figures | Shipped |
| Phase 4 (part) | Donation receipts | Shipped |
| Later | Filing tracking and Form 114 delivery, approval policy, budgets, TDS, GST, grants, FCRA and FC-4, outcomes, DPDP rights log, FY audit pack | Deferred |

The founder confirmed the rules marked "founder decision" below; the CA may still review any of them.

## Core decisions

| Decision | Choice | Why |
|---|---|---|
| Role of the dashboard | Operational sub-ledger and donor CRM. The CA keeps the statutory books from the dashboard's exports | The CA consolidates once a year |
| Books | Two append-only single-entry books linked by a posting: recognition (income, expense, asset, liability, fund effects) and account movements (money in and out). Never summed together | One `direction` can't mean both "we spent" and "money left the bank" |
| Top-level unit | Programme by cause, with optional time-boxed projects; teams are volunteer groups and never carry money | Matches how the trust and its grants report |
| Money | `bigint` paise, converted only at presentation and export through `@pi-dash/shared/money` | `integer` tops out near ₹2.1 crore |
| Fiscal calendar | April to March, monthly periods for dating; only the year closes | Founder decision |
| Dates | Economic, posting and bank value dates are separate Asia/Kolkata dates | Receipt and payment dates are statutory facts |
| Parties | One `party` per person or organisation; contact, ID and bank data server-only | One DPDP trail per person |
| Corrections | Never update or delete a posting; reverse and repost | Append-only books |
| Finance roles | Treasurer duties are permissions every finance admin holds; no Treasurer role | A user has one role |
| Advance payments | Discontinued; existing records are history and never post | Founder decision |
| Engagement money | Corporate and Goodera money is a donation (`csr` or `other`), never fee income | The audited statements show all income as donations |
| TDS, GST, cash | The trust deducts no TDS, is not GST-registered and keeps no cash | Founder answers |
| give.do | Collection intermediary; each give.do donor is our donor in our Form 113 | give.do receipts under the trust's 80G |
| CA handoff | XLSX only, dashboard head names, no Tally XML | CA preference |

## Dimensions

Tables in `packages/db/src/schema/finance-dimensions.ts`, mutators in `packages/zero/src/mutators/finance-dimensions.ts`. Reading needs `finance.view`; writing needs `finance.manage`.

| Table | Notes |
|---|---|
| `programme` | Code, name, cause, lead, optional `finance_threshold_paise` (stored, not enforced). Seeded: Education, Arts and culture, Community support, and the "Unallocated" holder |
| `project` | Under one programme; kind (class, edition, drive, engagement, other), dates, optional sponsor, intermediary and quoted budget. Syncs only to `finance.view` |
| `fund` | Source (domestic, fcra), restriction. General Fund (Domestic) is the default; the restricted Corpus Fund is reference data |
| `cost_centre` | Code, name, state/UT, active; see "Cost centres" below |
| `account_head` | Type income, expense, asset, liability or fund, parent, `tally_ledger_name` |
| `org_account` | Kind `bank`, `cash`, `gateway_clearing` or `deposit` (fixed deposit: no donations or statement imports), fund source, FCRA role, `is_main`. Deactivated, never deleted. No bank details yet |
| `fiscal_year`, `fiscal_period` | The monthly `ensure-fiscal-years` job keeps the current and next year present |
| `organisation_registration` | The trust's PAN, 12AB, 80G, FCRA and other registrations |

- Teams and events carry `programme_id`; occurrences inherit it when materialised. `project_id` on events is not built.
- Pickers never offer the Unallocated holder for a new pick. Edit forms keep a retired option in the picker, marked "(inactive)".
- Team mapping: the Gubbachi and PI Center class teams → Education; Kalakriti → Arts and culture; Core Team and Mumbai Team → Community support, with Mumbai's school engagements retagged to Education.

### Main bank account

`org_account.is_main` marks at most one active bank account (Settings → Organisation accounts). Marking another unmarks the old one; deactivating it unmarks it. Expense payments with no matched bank debit leave the account their standing posting already used, else the main bank account, else the only active bank account. With several and none marked, the expense waits ("mark the main bank account").

### Account heads

- Each expense category has an `EXPENSE_<NAME>` head under one `Expenses` parent, created by `ensureExpenseCategoryHeads` (`packages/db/src/ledger/expense-heads.ts`) on server start, in the seeds and during posting. Renaming a category doesn't rename its head. A category pointed at an asset head posts an asset; there is no screen for that.
- `repairExpensesParent` fixes older databases where `Expenses` shared the Corpus donations head's ID.
- The account-head mutator refuses changing the type of, or deactivating, a reference head or any head with entries.

## Expense "Charged to"

Every reimbursement and vendor payment records which work it served in `charged_to` (enum `expense_charged_to`), independent of its expense category:

- `event`: the event's programme (events carry no project).
- `programme`: `charged_programme_id`, optional `charged_project_id`, for ongoing costs with no event such as rent.
- `organisation`: admin costs (audit fee, bank charges, website). Shown as "Admin".

One target per request. Advance payments carry none and show "—".

- `expenseProgrammeOf(request)` in `packages/shared/src/expense-charge.ts` returns `{ programmeId, projectId, isAdmin }`. Every consumer goes through it: request tables and Programme filter (`apps/web/src/lib/request-programme.ts`), the spending chart, the financial-year export and expense posting.
- Database checks enforce the shape. A composite foreign key `(charged_project_id, charged_programme_id)` → `project(id, programme_id)` refuses a project under another programme.
- The claimant picks on the form (default Event) while pending. Finance (`finance.manage`, or `requests.approve` with `requests.view_all`) changes it later via `setChargedTo`, never on a rejected request or their own. Once posted, `setChargedTo` refuses and the card shows "In the books".
- Legacy requests without an event went to the submitter's team programme when unambiguous, else to Unallocated. Finance clears them with the "Unallocated · N" button ("To clear" filter).

## Cost centres

`cost_centre` holds where the work happens. Volunteer screens call it "City"; Settings, the Books, the CA workbook and finance views say "Cost centre". Bangalore (`BLR`) is active and Mumbai (`MUM`) inactive, since that chapter closed.

- `team_event`, `reimbursement`, `advance_payment` and `vendor_payment` carry `cost_centre_id` (`ON DELETE RESTRICT`). It is required on events, defaulting to Bangalore's fixed ID (`COST_CENTRE_IDS`); the app always sets it.
- A request takes its event's cost centre, as Programme follows Charged to: on an event it stores none, else it stores its own. `requestCostCentreId` (`packages/shared/src/cost-centre.ts`) is the rule for every reader: tables, filters, details, the financial-year export and expense posting. Checks: a reimbursement has `event_id IS NULL OR cost_centre_id IS NULL`; a vendor payment has exactly one of an event or its own. Advance payments keep their own, null on old rows.
- Picking: event and request forms offer active centres and hide the picker when only one is active; a request on an event has none (`use-request-city.ts`). Without a pick a new record takes the only active centre; with several the server asks "Choose the city". Mutators check through `pickCostCentreId` (`packages/zero/src/mutators/cost-centre-pick.ts`): a new pick must be an existing active centre, and keeping the current one is always allowed, so an old Mumbai record stays Mumbai. The event picker on requests hides inactive centres' events unless the request is already on one.
- Re-charging (`setChargedTo`) has no city picker: moving onto an event clears the request's own centre; moving off keeps the event's (`costCentreAfterRecharge`).
- Inactive centres are hidden from pickers, the City filters on the events, reimbursements, vendor payments and analytics pages (`apps/web/src/lib/cost-centre-filter.ts` keeps old `?city=bangalore` links working), the public agenda's city select (shown only with several active), the public feed (`recurring-events.md`) and the Social API. Old records keep their label in details, the CA workbook and the financial-year export, whose "City" header stays as a CSV contract.
- Settings → Cost centres (`/settings/cost-centres`, `finance.manage`, `costCentreMutators`) adds (name, code, state/UT), renames, and deactivates or reactivates. A centre is never deleted, its code never changes (the public feed uses it), and the last active one can't be deactivated.
- Every path that materialises an occurrence copies the series' centre (`recurring-events.md`); Kalakriti's linked technical event takes Bangalore's. Expense entries carry it (`finance-books.md`).

## Claim for others

See "Claim for others" in [reimbursements.md](reimbursements.md).

## Planned and deferred

Kept from the agreed design; none of this is built unless stated.

### Approval policy

- Programme-lead approval always, by a user who leads that programme; finance approval as well above a threshold (programme override, else `app_config.finance_threshold_default_paise`; both stored today, editable by `finance.manage`). A lead who is the claimant skips the lead step and finance approves regardless of amount.
- Creator, claimant and identifiable beneficiary can't approve or pay their own request; lead and finance must be different people; an approver may also pay. Nothing approves automatically.
- Planned `approval_step` table and permissions `finance.approve_lead`, `finance.approve`, `finance.confirm_payment`. Today approval uses `requests.approve`.
- A team lead may move an event between programmes until an expense links to it; after that only `finance.manage`.

### Budgets

`budget` and `budget_line` by fiscal year, scope and account head, measuring recognised cost at first. Fund and programme views are alternative cuts, never summed.

### Advance settlement

Advance payments are discontinued; their settlement rounds never post and existing records stay as history.

### In-kind

Built as consumed: income and an equal consumption, medium `in_kind`, no movement, excluded from cash views. Holding in-kind gifts as assets waits for a fixed asset register. In-kind corpus gifts net to nothing in the Corpus Fund (CA to advise).

### Filing tracking and Form 114

`donation_filing`, `donation_filing_row` (frozen donor snapshot, add/revise/delete, acknowledgement references) and `donation_certificate` (Form 114 received and emailed). Submitted rows are immutable; corrections are new filings.

### Other deferred work

- Requests: frozen revisions and `supersedes_id`; actor columns `set null` instead of cascading with the login; a Zero sync allowlist (payee account numbers on reimbursements still sync).
- Vendor invoices with GST components; TDS `withholding` and `tax_remittance`.
- Grants (`grant_agreement`, tranches, expenditure allocation, cash-basis utilisation certificates), engagement reports, `issued_invoice` as an acknowledgement with no posting. Grants are contributions for now.
- Outcomes: `event_outcome` counts service contacts, never unique children; volunteer minutes valued by `volunteer_hour_value_paise`, never posted.
- Exports: an FY audit pack replacing `/export`, donor statements.

### FCRA and FC-4

FCRA activation is its own gate before any foreign contribution; until then every import refuses non-INR money. It adds the FCRA registration scope, `org_account.fcra_role` routing, a foreign-source assessment on parties, original currency evidence, `contribution_ultimate_donor` for intermediaries, `ledger_entry.fcra_activity` and `fcra_expense_class` (nullable additions), a `fixed_asset` register and opening balances per FCRA account. FC-4 is a workbook built from these plus the CA-certified statements.

## Data protection and retention classes

Follows the trust's DPDP compliance guide, with DPDP obligations from about 12 May 2027.

- Encrypted and never synced: party ID numbers, party bank account numbers, receipt snapshot IDs. Planned: `org_account` bank details, payee account numbers on requests, filing-row donor IDs.
- Retention classes, held per record (`retention_policy_version`, `retain_until`, `retention_basis`, `legal_hold`): financial evidence ten years from the end of the tax year; import payloads months (built: 30 days unimported, 180 days after a run); money-related audit rows ten years, others thirteen months. Only `import_row` carries these columns today.
- Expiry runs as a privileged process, never through product mutations, and preserves the append-only books.
- `collection_event` records the basis and notice per collection. Receipt processing (section 7(a)) and statutory disclosure (7(d)) don't authorise fundraising messages; that needs its own consent.
- An erasure request removes CRM data where permitted; evidence under statutory retention or legal hold stays under restricted access. The `data_rights_request` log is not built. Finance parties survive login deletion.

## Open items

- CA review of every founder decision above, and sign-off of the cutover contracts in `finance-ledger-cutover.md`.
- Form 113 template and codes to verify against the portal before the first upload; whether CSR and partly refunded gifts are treated as built; whether the ₹2,000 cash limit carries over to the 2025 Act.
- GST is not needed unless the trust starts making taxable supplies.
