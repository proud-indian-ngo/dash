# Finance: books and posting

The ledger from 1 April 2026: tables, the posting engine, opening balances, year close, book-keeping permissions, posting runs and waiting to post, income and expense posting rules, audited figures and the CA handoff workbook.

Cutover figures, plain-language rules and workbook columns in [finance-ledger-cutover.md](finance-ledger-cutover.md); overview in [finance-and-programmes.md](finance-and-programmes.md).

## Books

Server code `packages/db/src/ledger/`; schema `packages/db/src/schema/ledger.ts`; Zero queries `packages/zero/src/queries/ledger.ts` (read-only, book readers only); web `apps/web/src/functions/books.ts`, `apps/web/src/routes/_app/finance/books/`.

### Tables

| Table | Holds |
|---|---|
| `posting` | One source action. Unique (`source_type`, `source_id`, `source_revision`, `action`) is the idempotency key; `reverses_posting_id` links a reversal (at most one). `created_by` has no FK |
| `ledger_entry` | Recognition: effect, amount, account head, fund, programme, project, event, party, medium (`monetary`, `in_kind`), memo |
| `account_movement` | Cash book: account, direction, amount, kind (`receipt`, `payout`, `transfer`, `refund`, `fee`, `tax_remittance`, `opening`), `bank_value_on`, `transfer_id` |
| `movement_allocation` | Links a movement to the bank line that reconciles it |
| `opening_balance` | The opening-balance document; one standing per year |
| `fiscal_year_event` | Close and reopen history |
| `audited_figures`, `audited_figures_line` | See "Audited figures" |
| `ledger_source_state` | Posting state per source (updated in place) |

### Immutability

The database refuses UPDATE, DELETE and TRUNCATE on the books tables, except the one-time reversal stamps and actor columns becoming NULL when a login is deleted. The SQL lives in `packages/db/src/ledger/immutability-sql.ts`; databases built with `drizzle-kit push` (CI E2E, isolated worktrees) get it from `ensureLedgerTriggers()`, which runs with the seeds and on every server start. A reviewed repair switches the guards off for one transaction with `SET LOCAL pi_dash.ledger_maintenance = 'on'`.

Foreign keys into the books are `restrict`, so:

- an event named by an expense can't be deleted, and nor can its team ("The books hold expenses for this team's events…");
- a vendor whose party the books name can't be deleted;
- a user whose requests or payments stand in the books can't be deleted ("…Ban it instead.", `userHasExpensesInBooks`), because requests still cascade with their login.

### Posting engine

- `post(tx, { sourceType, sourceId, sourceRevision?, action, economicOn, entries, movements }, { actorId })` validates (safe-integer amounts above zero, dates not before `LEDGER_CUTOVER_ON` = 2026-04-01, transfer legs share a `transfer_id` and net to zero), takes an advisory lock per source, returns the existing posting for a repeated key, reads the year `FOR SHARE`, refuses a closed or audited-figures-matched year, and sets `posted_on` to today in India. A repost after a reversal must bump `source_revision`.
- `reverse(tx, postingId, { reason, actorId, on? })` appends `reverse:<action>` with every effect and direction flipped, on the original dates (or the void day). A reversal into a closed year is refused; a reversal can't be reversed.
- Reference data (`reference-data.ts`): the Corpus Fund and fixed-ID heads, inserted on every server start and in the seeds (not a migration, because a new enum value can't be used in the transaction that adds it). If missing, posting refuses with "Books reference data missing". The heads named in the posting rules below are all reference data.

### Opening balances

`opening-balance.ts` posts the CA-confirmed opening document for the cutover year only: account lines as `opening` movements; fixed assets, liabilities and fund balances as General Fund entries. It posts only when it balances, and once until reversed; a correction reverses and re-enters. `/finance/books/opening` holds the form and Reverse for `finance.post_opening`. The figures are in `finance-ledger-cutover.md`.

### Year close

`year-close.ts`. Closing posts the year's records first, then needs the year ended, the previous year closed, the cutover year's opening balances posted, and nothing in the year waiting to post. Bank statements to the year end, clearing balances and audited figures are warnings only, because the audit finishes months later. Posting takes the year-close lock shared and closing takes it exclusive. Reopening needs a reason, is refused while a later year is closed, and queues a posting sweep.

### Funds carry the surplus

There is no year-close posting. Income less expenditure stays in the fund each entry is posted to, so a fund's opening is its fund balance entries plus every earlier year's corpus gifts and surplus, and the next year needs no opening entry. Reopening and posting into a year moves every later year's openings, so a signed-off workbook can drift from a fresh download. The Books summary assumes only the opening balances post to `Fund balance`.

### Book-keeping permissions

| Permission | Allows |
|---|---|
| `finance.view`, `finance.manage` | Read the books |
| `finance.post_opening` | Post or reverse opening balances |
| `finance.close_year` | Close a year |
| `finance.reopen_year` | Reopen a year |
| `finance.adjust` | Enter, skip and reverse audited figures |
| `finance.post_pending` | Books → Post pending |

Finance admins and super admins hold all of them; `admin` does not. `BOOKS_PAGE_PERMISSIONS` also admits `finance.post_opening` and `finance.adjust` to the Books page. Audit: `books.opening_balance.post` / `.reverse`, `books.year.close` / `.reopen`, `books.post_pending`, `books.audited_figures.*`, `books.ca_workbook.export`, with IDs and counts only; amounts, names and reasons stay in the books.

### Books page

`/finance/books` (`?year=`, `?account=`, `?tab=cash|income|balance`): Cash book with running balance, Income & expenditure by head or programme, and Balance summary with a balance check. The header menu holds close, reopen, Post pending, Audited figures and the CA workbook. Rows link to their source.

## Posting runs and waiting to post

- After a record changes, its own path queues `ledger-post-source` (singleton per source) after commit with `withFireAndForgetLog` (`packages/zero/src/mutators/ledger-queue.ts` for expenses). A source job also posts the sources that depend on it.
- Bulk paths queue the `ledger-post-pending` sweep instead. It runs daily at 03:30 India time and is the backfill from the cutover: each source in its own transaction, incremental through `ledger_source_state.source_updated_at`, everything on Sundays, stopping after 45 minutes.
- `income-posting.ts` (shared by expenses, run by `income-runner.ts`) compares the rules' result with what stands and reverses and reposts only the part that changed (`recognise`, `cash`, `settle`), each repost at the next `source_revision`. A deleted or no-longer-posting record is reversed.
- `ledger_source_state` holds `posted`, `waiting` with a reason (for example `year_closed`, `pick_bank_account`, `pick_other_account`, `audited_figures_matched`, `no_payment_proof`, `error`) or `none` with why (`before_cutover`, `not_received`, `not_processed`, `other_side_posts`).
- Bump `INCOME_RULES_VERSION` (`income-rules.ts`) when a rule change should reach posted sources. While `app_config.ledger_income_rules_version` is older, runs look at every source; the version is recorded after a clean full run.
- Books → Post pending (`finance.post_pending`) runs the sweep for up to 20 seconds and hands the rest to the job.

## Income posting rules

Rules in `packages/db/src/ledger/income-rules.ts` (pure, unit-tested). Plain-language versions are in `finance-ledger-cutover.md`.

| Source | Recognition | Cash book | Dated |
|---|---|---|---|
| Gateway gift (Razorpay, give.do), received, receipted or refunded | `Donations received` gross with fund, programme, project, donor; Razorpay: fee + GST as `Gateway charges` | Gross into clearing; Razorpay fee out | Received on |
| Direct gift (UPI, NEFT, cheque, cash) | `Donations received` | Into its account | Received on |
| Corpus gift | `Corpus donations` (fund head) in the Corpus Fund; gateway charges in the General Fund | As its channel | Received on |
| In kind | `In-kind donations` and equal `In-kind consumed`, medium `in_kind` | None | Received on |
| Refund | Decrease of the gift's head and dimensions | Out of the gift's account | Refunded on |
| Other income | `Interest on fixed deposit` for interest or anything into a deposit, else `Other income` | Into its account | Received on |
| Processed gateway settlement | Instant-settlement fee; give.do: each gift's charges with its dimensions | Net transfer clearing → bank; fees out | Matched bank line's date, else settled on |
| Bank line marked as transfer | None | Out of one account, into the other | Line's date |

- Corpus gifts are capital receipts (founder decision): credited straight to the Corpus Fund, outside the year's surplus; their charges are borne by the General Fund.
- Cutover: nothing before 1 April 2026 posts, except a gateway gift or refund captured earlier whose payout reached the bank on or after it, which posts on that payout's bank day so clearing opens at zero. A refund on or after the cutover posts even for an earlier gift.
- Payout's bank account: the matched bank line's account, else the account already posted to, else the single active bank account, else it waits.
- give.do fees, and the fee of a hand-recorded gift later linked to a Razorpay payment, post with the payout. Payout lines the books can't use are counted as "payout lines need a look" (`attention_count`).
- Transfers: marking a bank line as a transfer stores the other account (`transfer_org_account_id`). Between two bank accounts the second side pairs one-to-one (`transfer_pair_line_id`: opposite direction, same amount, within five days), and the first-marked line posts both legs.
- A classification edit reposts recognition only; a money edit reposts both parts; a reference-only change reposts nothing.

## Expense posting rules

Rules in `packages/db/src/ledger/expense-rules.ts`; facts in `expense-posting.ts`, run through the same machinery as income.

| Source | Recognition | Cash book | Dated |
|---|---|---|---|
| Reimbursement, approved, with payment proof (or a matched debit) | One expense per line under its category head, dimensions from `expenseProgrammeOf`, General Fund. `settle`: `Claims payable` up on approval, down on each payment | Out of the paying account, memo "Title (paid to Name)" | Approval day; money on each payment's day |
| Vendor payment request, invoice (or no-invoice reason) approved | One expense per line at full amount (no recoverable GST); equal `Supplier advances` decrease | None | Invoice approval day, else invoice date |
| Vendor payment, approved | `Supplier advances` increase, vendor as party | Out of the paying account with the reference | Payment date, or each matched debit's day |
| Bank charges / tax payment allocation (`statement_charge`) | `Bank charges` or `Taxes and government fees`, General Fund | Out of the line's account (`fee`, `tax_remittance`) | Line's date |

- Supplier advances (decision): the invoice always comes after payment (`vendor-payments.md`), so each payment is an advance until the invoice clears its own amount. An invoice above the approved payments waits; an overpayment stays on the vendor's advance.
- Claims payable (founder decision): the books balance on every date. A debit before approval shows a negative payable, meaning an advance to the claimant.
- Money follows the bank: each matched debit is one movement from the line's account on its value date; any unmatched rest leaves the main bank account on the default day. Unmatching restores the default. A matched debit counts as proof of payment.
- Cutover follows the money (founder decision): money that all left before 1 April 2026 is history and posts nothing, even if approved later; money on both sides waits for the CA (`bank_debit_across_cutover`). A request paid partly before the cutover waits ("Paid partly before 1 Apr 2026").
- Waits about the money (`no_payment_proof`, `bank_debit_across_cutover`, `match_exceeds_amount`, `pick_paying_account`) reverse what stands, so bank money is never counted twice. Other waits leave it. Reimbursements also wait for a missing approval day (`no_approval_day`); a zero total posts nothing.
- Expense sources repost only the changed part: a match moves `cash` and `settle`, never the expense entries. Edits after posting, resets, rejected payments and deletes reverse and repost by revision.
- Cost centre: entries carry the document's (`requestCostCentreId`), frozen at posting like the programme: each expense line (a provision's excess included), the reimbursement's `settle` part, and the `Supplier advances` decrease and increases. The `Audit fees payable` decrease, money movements and income entries carry none. A vendor payment's watermark includes its request's event, so changing an event's cost centre reposts its requests and their payments. Tests: `packages/db/src/ledger/cost-centre-posting.db.test.ts`.

### Payment proof after approval

`reimbursement.addPaymentProof` (`requests.approve`) adds or replaces the payment screenshot on an approved, unvoided claim and queues posting. A replaced screenshot is kept as an attachment. Reimbursements has a "Missing payment proof" filter (`lib/payment-proof.ts`) that the Books waiting list links to. Vendor payments never wait for a screenshot.

### Voiding

Founder decision: anything the books hold is voided, never deleted.

- `delete` refuses with "Posted to the books. Void it instead." (`assertDeletable` in `packages/zero/src/mutators/void.ts`).
- `reimbursement.void`, `vendorPayment.void`, `vendorPaymentTransaction.void` need `requests.void` and a reason. They set `voided_at`, `voided_by`, `void_reason` beside the unchanged status, so the status machines stay as they are. Voiding a request voids its payments, and a voided record refuses every further change.
- The posting run reverses what stands, dated the void day. Lists hide voided rows behind "Show voided · N". Vouchers stay, marked VOID; their numbers are never reused.

### Audit fee provision

Founder decision: paying the auditor clears the provision, and any excess is expense.

- When approving the auditor's invoice, finance can charge a line to "Audit fees payable (provision)" via `vendor_payment_line_item.provision_head_id`, allowed only for heads in `PROVISION_HEADS` (`@pi-dash/shared/provisions`; today `auditFeesPayable` only). The line decreases the provision by what is outstanding and posts the rest as `Audit fees` expense.
- `allocateProvision` (pure) takes invoices in posting-date then ID order, each clearing what is outstanding on its day, so the split never depends on the order the run visits invoices. Related invoices repost together (`relatedExpenseSources`).
- An invoice voided in the year it posted is dropped from the base, so a duplicate gives its share back; the provision can briefly dip below zero within that year, but the year end is right. A void in a later year, or an invoice in a frozen year, stays as it stands.
- The approval dialog's "Charge to a provision" link shows what is outstanding (`getVendorPaymentProvision`, read-only). Reimbursements can't be charged to a provision.

## Audited figures (year-end true-up)

The CA corrects the year in their own books (depreciation, provisions written back, reclassifications) and signs months later. Founder decision: one annual "Match audited figures" step instead of a general adjustment form. Code: `packages/shared/src/audited-figures.ts` (`balanceSheetLines`, `planAuditedFigures`).

- One standing `audited_figures` document per ended year, `matched` (CA name, signing date) or `skipped` (reason), with its lines in `audited_figures_line`. Guarded like the opening balances; a correction reverses and re-enters.
- Lines: every money account, each fixed asset, each liability head, each active fund, plus added lines for new provisions or assets.

| Line | A difference | Posts |
|---|---|---|
| Money account | Never adjusted: records are missing. Posting is refused while any differs | Nothing |
| Fixed asset carried at less | Depreciation | Asset decrease; `Depreciation` expense |
| Other asset or liability | Year-end adjustment | The line, against `Year-end adjustments (audited)` income (raises surplus, such as a provision written back) or expense (lowers it). Another head may be picked |
| Fund | Not adjusted directly. A fund still differing after the surplus flows needs a transfer between funds with a reason | `Transfers between funds` |

- All adjustments sit in the General Fund. The document must balance and every line must be entered. It posts as one posting dated the year's last day, so the next year opens from the audited figures with no entry.
- Preconditions: the year has ended and is open, the cutover opening balances stand, the previous ended year is matched or skipped, nothing waits to post. The server rereads the books under the year row lock and refuses figures entered against books that changed since the page opened.
- A matched year is frozen: the engine refuses postings dated in it or earlier, and changed records wait (`audited_figures_matched`). The usual flow: year ends, CA signs, reopen if closed, match, close again.
- Reversal is refused while a later year's figures stand; reversing the opening balances is refused while any stand.
- `/finance/books/audited?year=` (`finance.adjust` to act; `finance.view`, `finance.manage`, `finance.adjust` to read). Depreciation is not computed: the CA's figure is entered.

## CA handoff workbook

Books → ⋯ → Download CA workbook (XLSX) builds `proud-indian-ca-workbook-<FY>.xlsx` for the selected year, with the sheets and columns in `finance-ledger-cutover.md`. Disabled for years before FY 2026-27 and until the cutover opening balances are posted.

- `exportCaWorkbook({ fiscalYearId })` (`finance.view` or `finance.manage`), audited as `books.ca_workbook.export`. One read-only repeatable-read transaction (`readWorkbookSnapshot`, `packages/db/src/queries/ca-workbook.ts`); earlier years summed into brought-forward rows; 100,000-row bound on the year's rows. Sheets built in `apps/web/src/lib/ca-workbook/sheets.ts`, written by `write-excel-file` in memory.
- Sheets: Receipts and payments, Income and expenditure (reversals included), I&E summary (corpus gifts apart as capital receipts), Balance sheet items, Donor list. Column detail is in the cutover doc.
- Donor IDs are masked to the last four characters. The donor list is included only for `donors.view`, `donors.manage` or `finance.view_sensitive`.
