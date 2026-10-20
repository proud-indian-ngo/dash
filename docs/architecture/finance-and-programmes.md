# Finance and programmes

> **Load when**: finance overview, programmes, projects, funds, main bank account, account heads, Charged to, cost centres, budgets, outcomes, volunteer hour value, deferred finance work, FCRA, retention.
> **Related**: `authorization.md`, `data-layer.md`, `reimbursements.md`, `vendor-payments.md`, `cash-vouchers.md`

The dashboard keeps the trust's operational financial record year-round, organised by programme: expenses, income, donors, receipts and a single-entry set of books. The CA keeps the statutory books and takes year-end exports from the dashboard. The ledger starts at the cutover, 1 April 2026.

| Chapter | Covers |
|---|---|
| This one | Decisions, dimensions, Charged to, cost centres, budgets, outcomes, deferred work, data protection |
| [reimbursements.md](reimbursements.md) | Reimbursements, payouts, claim for others, advance payments, financial-year export |
| [finance-income.md](finance-income.md) | Donors, income, imports, Razorpay, give.do payouts, Reached bank |
| [finance-bank-statements.md](finance-bank-statements.md) | Bank statement lines, credit and debit matching, bank charges |
| [finance-books.md](finance-books.md) | Ledger, posting, opening balances, year close, audited figures, CA workbook |
| [finance-receipts-and-returns.md](finance-receipts-and-returns.md) | Donation receipts, donations return (Form 113/114) |
| [finance-ledger-cutover.md](finance-ledger-cutover.md) | The CA contract: cutover, opening figures, plain-language posting rules, CA questions, workbook columns |

The founder confirmed the rules marked "founder decision"; the CA may still review any of them.

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

Schema `packages/db/src/schema/finance-dimensions.ts`. Reading needs `finance.view`; writing needs `finance.manage`.

- `programme` includes a seeded "Unallocated" holder. Pickers never offer it for a new pick. Its `finance_threshold_paise` is stored but not enforced.
- `project` sits under one programme and syncs only to `finance.view`.
- `fund`: General Fund (Domestic) is the default; the restricted Corpus Fund is reference data.
- `org_account` of kind `deposit` (fixed deposit) never takes donations or statement imports. Accounts are deactivated, never deleted.
- The monthly `ensure-fiscal-years` job keeps the current and next fiscal year present.
- Teams and events carry `programme_id`; occurrences inherit it when materialised. Events carry no project.
- Edit forms keep a retired option in the picker, marked inactive.

### Main bank account

`org_account.is_main` marks at most one active bank account. Expense payments with no matched bank debit leave the account their standing posting already used, else the main bank account, else the only active bank account. With several and none marked, the expense waits.

### Account heads

- Each expense category has an `EXPENSE_<NAME>` head under one `Expenses` parent, ensured by `ensureExpenseCategoryHeads` on server start, in the seeds and during posting. Renaming a category doesn't rename its head. A category pointed at an asset head posts an asset; there is no screen for that.
- A reference head, or any head with entries, can't change type or be deactivated.

## Expense "Charged to"

Every reimbursement and vendor payment records which work it served in `charged_to`, independent of its expense category:

- `event`: the event's programme. The picker lists standalone events, series and each saved session of a series (one with attendance, members or edits); an unsaved session has no row, so a claim for it goes on the series.
- `programme`: a programme and optional project, for ongoing costs with no event such as rent.
- `organisation`: admin costs (audit fee, bank charges, website).

One target per request. Advance payments carry none.

- Every consumer goes through `expenseProgrammeOf` (`packages/shared/src/expense-charge.ts`): tables, the Programme filter, the spending chart, the financial-year export and expense posting.
- A composite foreign key refuses a project under another programme.
- The claimant picks it while pending. Finance (`finance.manage`, or `requests.approve` with `requests.view_all`) changes it later via `setChargedTo`, never on a rejected request or their own, and never once posted.
- Legacy requests without an event went to the submitter's team programme when unambiguous, else to Unallocated, for finance to clear.

## Cost centres

`cost_centre` holds where the work happens. Volunteer screens call it "City"; finance screens and the CA workbook say "Cost centre". Bangalore is active; Mumbai is inactive since that chapter closed.

- Events, reimbursements, advance payments and vendor payments carry `cost_centre_id`. It is required on events.
- A request takes its event's cost centre, as Programme follows Charged to: on an event it stores none, else it stores its own. Every reader goes through `requestCostCentreId` (`packages/shared/src/cost-centre.ts`), including the export and expense posting. Database checks enforce the shape; advance payments keep their own, null on old rows.
- Mutators check picks through `pickCostCentreId`: a new pick must be an active centre, and keeping the current one is always allowed, so an old Mumbai record stays Mumbai. With several active centres and no pick, the server asks for one.
- Re-charging onto an event clears the request's own centre; moving off keeps the event's.
- Inactive centres are hidden from pickers, City filters, the public agenda, the public feed and the Social API. Old records keep their label in details and exports. The financial-year export's "City" header is a CSV contract.
- A centre is never deleted, its code never changes (the public feed uses it), and the last active one can't be deactivated.
- Every path that materialises an occurrence copies the series' centre (`recurring-events.md`); Kalakriti's linked technical event takes Bangalore's. Expense entries carry it (`finance-books.md`).

## Claim for others

See "Claim for others" in [reimbursements.md](reimbursements.md).

## Budgets

Finance → Budgets (`/finance/budgets`) sets a year's budget for a programme, and optionally for a project under it, split by expense head, and shows it against the books (founder decisions).

- `budget` (fiscal year, programme, optional project, note) is unique per year, programme and project; a composite foreign key keeps the project under the programme. `budget_line` holds one amount per head in paise; a head without a line has no budget, and ₹0 is a budget. Saving with every head blank removes the budget. A project with a budget can't move to another programme. A project's quoted budget (the amount quoted to a sponsor) is a separate field and plays no part here.
- Budgetable heads are the expense heads expense categories post to, so the heads claims and vendor payments are booked to, plus `In-kind consumed` and `Gateway charges`, which post with a programme (founder decision; `budgetableHeadIds`). Spend on other expense heads (bank charges, depreciation) shows as unbudgeted. A head a budget already holds stays on it. New budgets need an active programme, never Unallocated.
- Reading needs `finance.view` (budgets sync only to it); setting needs `finance.manage` through the audited `budget.save` mutator.
- Actual is the expense the books recognise: entries on expense heads by economic date within the year, net of reversals, the same figures as Books → Income & expenditure. Actuals are never stored: `loadBudgetActuals` (`packages/db/src/queries/budget-actuals.ts`) sums them in SQL per programme, project and head.
- `budgetYearView` (`packages/shared/src/budgets.ts`) lays them out without double counting. A programme budget's actual is all its spend, projects included, on every head; a head with spend and no line shows as unbudgeted within it. A project budget's actual is that project's spend only, nested under its programme and never added to the totals. Spend in a programme without a programme budget, or with no programme, is in the Unbudgeted group, so budgeted plus unbudgeted spend is the year's expenditure. A programme shown only for its project budgets has its actual muted, since Unbudgeted counts it.
- Spend above the budget, by any amount, shows in red only. Approvals, claims and vendor payments are never warned or blocked.

## Outcomes

Analytics → Outcomes ([teams and events](teams-and-events.md#other-pages)) derives impact from events already recorded; nothing is entered for it (founder decision). `loadOutcomeRows` (`packages/db/src/queries/outcomes.ts`) aggregates in SQL and `summarizeOutcomes` (`packages/shared/src/outcomes.ts`) rolls the rows up.

- **Events held**: saved event rows that have ended (or started, without an end time), are not cancelled and are not Kalakriti-managed: standalone events, series parents (a parent is its series' first session, on its own times) and saved occurrences. Where older data holds an exception row on its series' own start date, that row stands for the first session and the parent is not counted; if that row is cancelled, neither is. A parent whose own start date its rule or exdates exclude still counts as a session. Kalakriti's linked event is a technical record whose people live in the Edition. The range filters on the start time; programme, team and city are the event's own.
- **Children reached**: the sum of `children_attended` over events with a completed social recap; undoing a recap drops its children until it is marked ready again. These are child contacts, never unique children: a child at weekly classes counts each time.
- **Volunteer hours**: per event, members marked present × start to end. Attendance is counted per event before the join, so members never multiply children. Events without an end time add no hours.
- **Value of volunteer time**: hours × `app_config.volunteer_hour_value_paise`, which `finance.manage` sets in Settings → Programmes. Blank means not set, and the tile asks for it. It is for reports only and is never posted to the books.
- **Coverage**: the page counts held events without a recap (`social_completed_at` unset; their children are not counted), without any attendance marked, and without an end time, so a low figure is not read as low impact. A recap that records no children is complete. Past sessions of a live series that nobody saved count as events held with no recap and no attendance: `unsavedSessionRows` expands the series rule (skipping saved dates, exdates and exclude rules) and takes programme, team and city from the series.

## Planned and deferred

Kept from the agreed design; none of this is built unless stated.

### Approval policy

- Programme-lead approval always, by a user who leads that programme; finance approval as well above a threshold (programme override, else `app_config.finance_threshold_default_paise`; both stored today). A lead who is the claimant skips the lead step and finance approves regardless of amount.
- Creator, claimant and identifiable beneficiary can't approve or pay their own request; lead and finance must be different people; an approver may also pay. Nothing approves automatically.
- Planned `approval_step` table and permissions `finance.approve_lead`, `finance.approve`, `finance.confirm_payment`. Today approval uses `requests.approve`.
- A team lead may move an event between programmes until an expense links to it; after that only `finance.manage`.

### In-kind

Built as consumed: income and an equal consumption, medium `in_kind`, no movement, excluded from cash views. Holding in-kind gifts as assets waits for a fixed asset register. In-kind corpus gifts net to nothing in the Corpus Fund (CA to advise).

### Filing tracking and Form 114

`donation_filing`, `donation_filing_row` (frozen donor snapshot, add/revise/delete, acknowledgement references) and `donation_certificate` (Form 114 received and emailed). Submitted rows are immutable; corrections are new filings.

### Other deferred work

- Requests: frozen revisions and `supersedes_id`; actor columns `set null` instead of cascading with the login; a Zero sync allowlist (payee account numbers on reimbursements still sync).
- Vendor invoices with GST components; TDS `withholding` and `tax_remittance`.
- Grants (agreements, tranches, expenditure allocation, cash-basis utilisation certificates), engagement reports, `issued_invoice` as an acknowledgement with no posting. Grants are contributions for now.
- Exports: an FY audit pack replacing `/export`, donor statements.

### FCRA and FC-4

FCRA activation is its own gate before any foreign contribution; until then every import refuses non-INR money. It adds the FCRA registration scope, `org_account.fcra_role` routing, a foreign-source assessment on parties, original currency evidence, `contribution_ultimate_donor` for intermediaries, `ledger_entry.fcra_activity` and `fcra_expense_class` (nullable additions), a `fixed_asset` register and opening balances per FCRA account. FC-4 is a workbook built from these plus the CA-certified statements.

## Data protection and retention classes

Follows the trust's DPDP compliance guide, with DPDP obligations from about 12 May 2027.

- Encrypted and never synced: party ID numbers, party bank account numbers, receipt snapshot IDs. Planned: `org_account` bank details, payee account numbers on requests, filing-row donor IDs.
- Retention classes, held per record: financial evidence ten years from the end of the tax year; import payloads months (built: 30 days unimported, 180 days after a run); money-related audit rows ten years, others thirteen months. Only `import_row` carries the retention columns today.
- Expiry runs as a privileged process, never through product mutations, and preserves the append-only books.
- `collection_event` records the basis and notice per collection. Receipt processing (section 7(a)) and statutory disclosure (7(d)) don't authorise fundraising messages; that needs its own consent.
- An erasure request removes CRM data where permitted; evidence under statutory retention or legal hold stays under restricted access. The `data_rights_request` log is not built. Finance parties survive login deletion.

## Open items

- CA review of every founder decision, and sign-off of the cutover contracts in `finance-ledger-cutover.md`.
- Form 113 template and codes to verify against the portal before the first upload; whether CSR and partly refunded gifts are treated as built; whether the ₹2,000 cash limit carries over to the 2025 Act.
- GST is not needed unless the trust starts making taxable supplies.
