# Finance: books and posting

The ledger from 1 April 2026: the posting engine, opening balances, year close, book-keeping permissions, posting runs, income and expense posting rules, audited figures and the CA workbook.

Cutover figures, plain-language rules and workbook columns in [finance-ledger-cutover.md](finance-ledger-cutover.md); overview in [finance-and-programmes.md](finance-and-programmes.md).

## Books

Server code starts in `packages/db/src/ledger/`; schema in `packages/db/src/schema/ledger.ts`. Zero queries over the books are read-only.

The cash book can render before statement-only data arrives. Keep the other book subscriptions warm for tab changes, and retain the full statement loading guard for audited drift. Cached data remains visible during resyncs, following the [Zero loading rules](../../.agents/skills/zero-patterns/SKILL.md).

A `posting` is one source action; its unique (`source_type`, `source_id`, `source_revision`, `action`) is the idempotency key. It holds `ledger_entry` rows (recognition) and `account_movement` rows (cash book). `ledger_source_state` is the one books table updated in place.

### Immutability

The database refuses UPDATE, DELETE and TRUNCATE on the books tables, except the one-time reversal stamps and actor columns becoming NULL when a login is deleted. Databases built with `drizzle-kit push` (CI E2E, isolated worktrees) get the triggers from `ensureLedgerTriggers()`, which runs with the seeds and on every server start. A reviewed repair switches the guards off for one transaction with `SET LOCAL pi_dash.ledger_maintenance = 'on'`.

Foreign keys into the books are `restrict`, so an event named by an expense can't be deleted, nor its team, nor a vendor whose party the books name. A user whose requests or payments stand in the books can't be deleted either, and must be banned instead, because requests still cascade with their login.

### Posting engine

- `post()` validates amounts, dates (not before the cutover) and transfer legs, takes an advisory lock per source, returns the existing posting for a repeated key, and refuses a closed or audited-figures-matched year. A repost after a reversal must bump `source_revision`.
- `reverse()` appends a mirror posting on the original dates (or the void day). A reversal into a closed year is refused; a reversal can't be reversed.
- Reference data (the Corpus Fund and fixed-ID heads) is inserted on every server start and in the seeds, not by a migration, because a new enum value can't be used in the transaction that adds it. Without it, posting refuses. The heads named in the posting rules below are all reference data.

### Opening balances

The CA-confirmed opening document posts for the cutover year only: account lines as `opening` movements; fixed assets, liabilities and fund balances as General Fund entries. It posts only when it balances, and once until reversed; a correction reverses and re-enters. The figures are in `finance-ledger-cutover.md`.

### Year close

Closing posts the year's records first, then needs the year ended, the previous year closed, the cutover year's opening balances posted, nothing in the year waiting to post, and no bank line dated in the year open (not matched in full or ignored), since an open line would be stuck: imports and line actions into a closed year are refused. Bank statements to the year end, clearing balances and audited figures are warnings only, because the audit finishes months later. Posting takes the year-close lock shared and closing takes it exclusive. Reopening needs a reason, is refused while a later year is closed, and queues a posting sweep.

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

Finance admins and super admins hold all of them; `admin` does not. Book-keeping actions are audited with IDs and counts only; amounts, names and reasons stay in the books.

## Posting runs and waiting to post

- After a record changes, its own path queues `ledger-post-source` (singleton per source) after commit. A source job also posts the sources that depend on it.
- Bulk paths queue the `ledger-post-pending` sweep instead. It runs daily and is the backfill from the cutover: each source in its own transaction, incremental through `ledger_source_state.source_updated_at`, everything on Sundays.
- Each run compares the rules' result with what stands and reverses and reposts only the part that changed (`recognise`, `cash`, `settle`), each at the next `source_revision`. A deleted or no-longer-posting record is reversed.
- `ledger_source_state` holds `posted`, `waiting` with a reason, or `none` with why.
- Bump `INCOME_RULES_VERSION` (`income-rules.ts`) when a rule change should reach posted sources. While the stored version is older, runs look at every source; the version is recorded after a clean full run.
- Books → Post pending runs the sweep for a few seconds and hands the rest to the job.

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
- give.do fees, and the fee of a hand-recorded gift later linked to a Razorpay payment, post with the payout.
- Transfers: between two bank accounts the second side pairs one-to-one (opposite direction, same amount, within five days), and the first-marked line posts both legs.
- A classification edit reposts recognition only; a money edit reposts both parts; a reference-only change reposts nothing.

## Expense posting rules

Rules in `packages/db/src/ledger/expense-rules.ts`, run through the same machinery as income.

| Source | Recognition | Cash book | Dated |
|---|---|---|---|
| Reimbursement, approved, with payment proof (or a matched debit) | One expense per line under its category head, dimensions from `expenseProgrammeOf`, General Fund. `settle`: `Claims payable` up on approval, down on each payment | Out of the paying account | Approval day; money on each payment's day |
| Vendor payment request, invoice (or no-invoice reason) approved | One expense per line at full amount (no recoverable GST); equal `Supplier advances` decrease | None | Invoice approval day, else invoice date |
| Vendor payment, approved | `Supplier advances` increase, vendor as party | Out of the paying account with the reference | Payment date, or each matched debit's day |
| Bank charges / tax payment allocation | `Bank charges` or `Taxes and government fees`, General Fund | Out of the line's account | Line's date |

- Supplier advances (decision): the invoice always comes after payment (`vendor-payments.md`), so each payment is an advance until the invoice clears its own amount. An invoice above the approved payments waits; an overpayment stays on the vendor's advance.
- Claims payable (founder decision): the books balance on every date. A debit before approval shows a negative payable, meaning an advance to the claimant.
- Money follows the bank: each matched debit is one movement from the line's account on its value date; any unmatched rest leaves the main bank account on the default day. Unmatching restores the default. A matched debit counts as proof of payment.
- Cutover follows the money (founder decision): money that all left before 1 April 2026 is history and posts nothing, even if approved later; money on both sides waits for the CA. A request paid partly before the cutover waits.
- Waits about the money reverse what stands, so bank money is never counted twice. Other waits leave it. A zero total posts nothing.
- Expense sources repost only the changed part: a match moves `cash` and `settle`, never the expense entries.
- Cost centre: entries carry the document's (`requestCostCentreId`), frozen at posting like the programme: each expense line (a provision's excess included), the reimbursement's `settle` part, and the `Supplier advances` decrease and increases. The `Audit fees payable` decrease, money movements and income entries carry none. A vendor payment's watermark includes its request's event, so changing an event's cost centre, programme or project reposts its requests and their payments.

### Payment proof after approval

A payment screenshot can be added or replaced on an approved, unvoided claim, which queues posting; a replaced screenshot is kept as an attachment. Vendor payments never wait for a screenshot.

### Voiding

Founder decision: anything the books hold is voided, never deleted.

- `delete` refuses once posted (`assertDeletable` in `packages/zero/src/mutators/void.ts`).
- Voiding needs `requests.void` and a reason. It sets void columns beside the unchanged status, so the status machines stay as they are. Voiding a request voids its payments, and a voided record refuses every further change.
- The posting run reverses what stands, dated the void day. Vouchers stay, marked VOID; their numbers are never reused.

### Audit fee provision

Founder decision: paying the auditor clears the provision, and any excess is expense.

- When approving the auditor's invoice, finance can charge a line to a provision head (`PROVISION_HEADS` in `@pi-dash/shared/provisions`; today `Audit fees payable` only). The line decreases the provision by what is outstanding and posts the rest as `Audit fees` expense.
- `allocateProvision` takes invoices in posting-date then ID order, each clearing what is outstanding on its day, so the split never depends on the order the run visits invoices. Related invoices repost together.
- An invoice voided in the year it posted is dropped from the base, so a duplicate gives its share back; the provision can briefly dip below zero within that year, but the year end is right. A void in a later year, or an invoice in a frozen year, stays as it stands.
- Reimbursements can't be charged to a provision.

## Audited figures (year-end true-up)

The CA corrects the year in their own books (depreciation, provisions written back, reclassifications) and signs months later. Founder decision: one annual "Match audited figures" step instead of a general adjustment form. Code: `packages/shared/src/audited-figures.ts`.

- One standing document per ended year, matched (CA name, signing date) or skipped (reason). Guarded like the opening balances; a correction reverses and re-enters.
- Lines: every money account, each fixed asset, each liability head, each active fund, plus added lines for new provisions or assets.

| Line | A difference | Posts |
|---|---|---|
| Money account | Never adjusted: records are missing. Posting is refused while any differs | Nothing |
| Fixed asset carried at less | Depreciation | Asset decrease; `Depreciation` expense |
| Other asset or liability | Year-end adjustment | The line, against `Year-end adjustments (audited)` income (raises surplus, such as a provision written back) or expense (lowers it). Another head may be picked |
| Fund | Not adjusted directly. A fund still differing after the surplus flows needs a transfer between funds with a reason | `Transfers between funds` |

- All adjustments sit in the General Fund. The document must balance and every line must be entered. It posts as one posting dated the year's last day, so the next year opens from the audited figures with no entry.
- Preconditions: the year has ended and is open, the cutover opening balances stand, the previous ended year is matched or skipped, nothing waits to post. The server rereads the books under the year row lock and refuses figures entered against books that changed since the page opened.
- A matched year is frozen: the engine refuses postings dated in it or earlier, and changed records wait. The usual flow: year ends, CA signs, reopen if closed, match, close again.
- Reversal is refused while a later year's figures stand; reversing the opening balances is refused while any stand.
- Depreciation is not computed: the CA's figure is entered.

## CA handoff workbook

Builds one XLSX per year, with the sheets and columns in `finance-ledger-cutover.md`. Unavailable for years before FY 2026-27 and until the cutover opening balances are posted.

- Read in one repeatable-read transaction (`packages/db/src/queries/ca-workbook.ts`), with earlier years summed into brought-forward rows. Sheets are built in `apps/web/src/lib/ca-workbook/`.
- Donor IDs are masked to the last four characters. The donor list is included only for `donors.view`, `donors.manage` or `finance.view_sensitive`.

## Audit pack

One ZIP per year for the CA: the workbook, every stored document its rows name, the signed agreement of each grant behind the year's income or certificates, and the year's final filings and certificates (submitted Form 113 filings with their Form 114 certificates; utilisation certificates `final` or `awaiting_ca`). Governance documents stay out. Code: `apps/web/src/lib/audit-pack/`.

- It holds full ID numbers and bank details, so it needs `finance.view_sensitive` on top of reading the books, and is rate limited.
- Two steps, so the browser never buffers the ZIP. `prepareAuditPack` (audited as `books.audit_pack.download`, with counts as prepared) builds the workbook and document list, checks every object and the size caps, and returns a short-lived, single-use token bound to the user. The Books dialog then starts a native download of `GET /api/audit-pack?token=`, which streams and records how it ended as `books.audit_pack.stream` (success, failure, or cancelled). A bare GET starts nothing.
- Tokens, like the rate limiter, live in the server process: this assumes one app instance.
- A slow prepare or object read relies on the server's raised [idle timeout](monorepo.md#production-server); a read that stalls longer is still cut.
- Cancel in the dialog aborts the prepare request. The prepare checks for the abort between its phases (after the workbook, after the document list, before each object check), so work already started in a phase finishes first. Once the download runs, the browser cancelling it cancels the response body, which stops the open storage read; it is recorded as a cancelled stream.
- A refused GET (expired or spent token, signed out, no access) sends a browser navigation back to the Books page, which shows the reason; other callers get the status and a JSON error.
- The workbook inside is built by the same code as the Books download, with the donor list. It is a fresh copy, so it can differ from one the CA signed; the README says so.
- `index.xlsx` (separate, so the workbook stays what the Books page gives) has one row per file of each document per sheet: Included (with path and SHA-256), Missing, Link or No file, with a note marking superseded proofs, vouchers and signatures and documents of voided records. Year documents no row names sit on the "Year documents" sheet. Documents come from the workbook's own rows, so year boundaries are the workbook's.
- No file is kept for bank statement or settlement files, opening balances, audited figures, refunds or other income; their rows say No file. A receipt issued before PDFs were stored is Missing until it is opened once.
- An object storage doesn't hold becomes Missing, never a broken ZIP. Files stream one at a time (`createZipStream`, shared with the reimbursements export), hashed on the way, and a size that differs from the preflight fails the stream; the index is written last.
- Names are cut to 80 characters with the record's short ID kept, never end in a dot or space, and Windows-reserved names (`CON`, `LPT1`) get a leading `_`.
- fflate writes no ZIP64, so a year over 3.5 GiB or 60,000 files is refused with a message.
