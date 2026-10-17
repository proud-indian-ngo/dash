# Finance ledger cutover: contract with the CA

> **Status**: built; founder answers recorded, CA confirmation pending. Items marked **Proposal** or "open for the CA" need sign-off.
> **Load when**: ledger cutover, opening balances, posting rules in plain language, backfill of FY 2026-27, CA handoff workbook columns, fixed deposit account, audited FY 2025-26 figures.
> **Related**: `finance-books.md` (posting engine, income and expense posting, audited figures, CA workbook build), `finance-and-programmes.md` (overview), `vendor-payments.md`

This is the agreement between the founder and the chartered accountant (CA, GVNKA & Associates): from which day the dashboard keeps the books, which balances it starts from, how each event is recorded, and what the CA receives at year end. The dashboard is an operational record that feeds the CA; the CA still keeps the statutory books and signs the statements.

## 1. Cutover

The ledger starts on **1 April 2026**, the first day of FY 2026-27. Opening balances come from the audited FY 2025-26 statements (signed 30 September 2026).

| Range | Dates | Books kept by | In the ledger? |
|---|---|---|---|
| Historical | to 31 March 2026 | The CA; audited statements | Only as closing balances, entered once as opening balances |
| Live | from 1 April 2026 | The dashboard, handed to the CA yearly | Yes |

- Nothing dated before 1 April 2026 posts. Earlier records stay as history; the audited balances already hold them.
- Everything dated on or after 1 April 2026 posts once the ledger is on.
- Opening balances post once, dated 1 April 2026, and change only through a CA-confirmed correction (`finance.adjust`, with a reason).

### Backfill to go-live

Activity between 1 April 2026 and go-live posts only from evidence the dashboard holds or the founder supplies, never from estimates: contributions (hand-entered, imported, or from Razorpay with fee and GST), refunds, Razorpay and give.do settlements, bank statement lines, other income, approved reimbursements with their payment screenshot, and vendor payment transactions. Approval of a reimbursement happens only after payment, so the screenshot is the payment evidence and the approval date the default payment date. Legacy advance payments post nothing; advances were discontinued and none were outstanding at 31 March 2026.

A backfilled posting keeps its document's economic date and is marked backfilled in the CA workbook. A payment with no evidence does not post; it goes on the founder's list (section 6).

## 2. Opening balances at 1 April 2026

From the audited balance sheet at 31 March 2026.

| Audited line | ₹ | Enters as |
|---|---|---|
| Cash at bank (current account) | 4,00,648 | Opening movement into the current account `org_account` |
| Deposits at bank (fixed deposit) | 7,00,000 | Opening movement into the FD `org_account` (kind `deposit`) |
| Property, plant and equipment, net (WDV) | 4,391 | One opening line per asset under `Fixed assets` |
| **Total assets** | **11,05,039** | |
| Corpus Fund | 1,001 | Opening line for fund "Corpus Fund" (restricted) |
| General Fund | 10,94,038 | Opening line for "General Fund (Domestic)" |
| Audit fees payable | 10,000 | Opening liability under `Audit fees payable` |
| **Total funds and liabilities** | **11,05,039** | |
| Razorpay and give.do clearing | 0 | No line |
| Payables, advances, receivables | 0 | No line |

The General Fund is the opening 4,45,052 plus the FY 2025-26 surplus of 6,48,986.

A finance admin (`finance.post_opening`) enters the figures at Finance → Books → Opening balances (`/finance/books/opening`); they are never seeded or hard-coded. The document will not post unless assets equal funds plus liabilities and the CA's name and confirmation date are recorded. Account lines become opening movements; asset, liability and fund lines are opening entries with no money movement. A correction reverses the whole document and posts a new one. Uploading the signed statements as evidence is not built.

### Fixed deposit

Org accounts of kind `deposit` ("Fixed deposit" in Settings → Organisation accounts):

- are never offered for donations and never take bank statement imports (the contribution form, mutator and income imports refuse them);
- get money only by transfer: placing or closing an FD posts from the current account's statement line marked as a transfer with the FD as the other account;
- earn interest recorded as `other_income` of kind interest, never as a donation.

FD interest of 3,817 was income in FY 2025-26; no accrued interest receivable opens.

### Fixed assets

Gross 27,842, accumulated depreciation 23,451, net 4,391, depreciated on WDV at Income-tax Act rates.

| Asset | Net at 31 March 2026 (₹) |
|---|---|
| Tailoring machine | 3,986 |
| Croma speaker | 332 |
| Solar power bank equipment | 73 |

Each posts as its own opening line, named in the description, so the Phase 5 fixed asset register can adopt them without changing posted data. Per-asset rates, gross and accumulated depreciation are asked of the CA (question 7).

## 3. Posting rules

Each event records into up to two views that are never added together:

- **Recognition** (income and expenditure), tagged with programme, project, event, fund and account head.
- **Cash book** (money movements) in the bank account, the FD or the Razorpay and give.do clearing accounts.

| Event | Recognition | Cash book |
|---|---|---|
| Gateway (Razorpay, give.do) captures a gift | Donation income at full amount; fee and GST as expense | Full amount into clearing; fee and GST out |
| Gateway pays out to the bank | Nothing | Net amount transferred from clearing to bank |
| Direct gift (bank transfer, UPI, cheque, cash) | Donation income | Into the deposited account |
| Other income (FD interest, other) | Other income | Into that account |
| Acknowledgement or invoice sent to a corporate or Goodera | Nothing; engagement money is a donation, recognised when received | Nothing |
| Refund to a donor | Donation income reduced | Out of the paying account |
| In-kind gift | In-kind income at fair value and an equal consumption expense | Nothing; labelled in-kind |
| Reimbursement approved (already paid) | Expense per line | Out of the main bank account |
| Vendor payment paid | Nothing; held as a supplier advance (an asset) | Out of the main bank account |
| Vendor invoice accepted | Expense per line at full invoice amount (not GST-registered); clears the advance | Nothing |
| Money moves between own accounts | Nothing | Out of one, into the other, linked |
| Correction | Reversal plus new entry | Only if money moved |
| Opening balances | Fund, liability and asset lines | Into bank and FD |

Each posting is final; a change is a reversal plus a new entry, and the workbook shows both. Records that cannot post yet (closed year, unknown account, missing head) wait on the Books page's "Waiting to post" list with a reason, and a year cannot close while any of its records wait.

### Income (`packages/db/src/ledger/income-rules.ts`)

All income rules live in this one module, so a CA change is a one-place edit.

- A gateway gift is income on the donor's payment (capture) date at the full amount. Razorpay's fee and GST are expense at the gift; give.do's charges are expense on the payout day, from the payout file.
- A gift captured before 1 April 2026 whose payout reached the bank on or after it posts on the payout's bank day as FY 2026-27 income (no gateway balance at 31 March 2026). One paid out before 1 April never posts.
- A refund before 1 April 2026 of such a gift, taken back by a payout that reached the bank on or after 1 April, also posts on that payout's bank day.
- A refund on or after 1 April 2026 reduces FY 2026-27 income on its own day, even for an earlier gift.
- A payout transfers the net amount from clearing to the bank account its statement line is matched to (else the only active bank account), on that line's date (else the settlement date).
- A corpus gift (donation type corpus) is a capital receipt credited straight to the Corpus Fund under `Corpus donations`, outside the I&E surplus. Only corpus gifts go to the Corpus Fund. Its gateway charges are a General Fund expense, so the fund keeps the gross; a refund reduces the fund. Already-posted corpus gifts repost under this rule on the next run, except in a closed year. Open for the CA: an in-kind corpus gift still follows the in-kind rule.
- FD interest (other income of kind interest, or anything credited to the FD) posts under `Interest on fixed deposit` when credited, with no accrual.
- A transfer between the current account and the FD posts once a reviewer marks the bank line as a transfer and picks the other account; between two bank accounts, from whichever side is marked first.
- A reversed or pending gift posts nothing; a refunded gift posts its receipt and its refunds.
- A classification change (programme, project, fund, donor) reposts the income line only; an amount, date or account change reposts the money too.

### Expenses (`packages/db/src/ledger/expense-rules.ts`)

- "The main bank account" is the one marked so in Settings → Organisation accounts, else the only active bank account.
- An approved reimbursement is an expense per line under its category's account head, with its programme, project and event, in the General Fund, on the approval day. A `Claims payable` liability is raised that day and cleared by each payment on the day the money left; a payment before approval shows as a negative payable (an advance to the claimant). One without a payment screenshot waits (section 6).
- A vendor payment is held as a supplier advance until the invoice (or no-invoice reason) is approved; the invoice then posts expense per line at full amount and clears the advance. An overpayment stays on the advance; an invoice above the approved payments waits until they agree.
- The trust is not GST-registered and deducts no TDS, so neither posts anything.
- Once a bank debit is matched to a reimbursement or vendor payment, its money out follows the bank: the line's account and value date, split when several debits paid it. Unmatching restores the main bank account and approval or payment day.
- An unmatched debit can be marked as bank charges (`Bank charges`) or a tax payment (`Taxes and government fees`, for the CA to classify).
- The cutover follows the money, because the audited FY 2025-26 accounts are cash-basis for payments. A claim or vendor payment whose bank debits are all before 1 April 2026 is history, even if approved later. One approved before but debited on or after posts on the debit day. Debits on both sides wait for the CA. Statement lines before 1 April 2026 are evidence only.
- The audit fee provision: when finance approves the auditor's invoice, it charges the line to "Audit fees payable (provision)". The payment clears what is outstanding on the invoice's day; any excess is FY 2026-27 expense under `Audit fees`. A provision of 7,500 and a bill of 9,000 clear 7,500 and post 1,500. Each year the CA provides for that year's fee and the audited figures bring the provision in on 31 March, so nothing is written back and the fee counts once. Details in `vendor-payments.md`.

## 4. Questions for the CA

Founder answers are recorded under each question; the CA confirms or corrects them.

1. **Gateway receipt date, gross or net.** The accounting policy says donations are recognised on receipt basis.
   1. Is "receipt" for a gateway gift the capture date or the bank credit date? Gross with the fee as expense, or net?
   2. With no gateway balance at 31 March 2026, gifts captured in March and paid out in April 2026 appear to be FY 2026-27 income. **Proposal**: post them on the payout's bank day, gross, with the payout as a same-day transfer, so clearing stays at zero.
   3. The FY 2026-27 donations return (Form 113) excludes gifts dated before 1 April 2026. Should the gifts in 2 be in it, and were 80G receipts already issued for them?
   4. **Proposal**: a FY 2026-27 refund of an earlier gift reduces FY 2026-27 income on the refund day.
   - **Founder**: capture date, gross; items 2 and 4 as proposed, so no gift falls between the years.
2. **Income presentation.** The statements show all income as "Donations received", including corporate engagement money. Keep one line, or sub-lines (CSR, Goodera, individual)? Donation type and channel are recorded on every gift, so either works.
3. **Expense heads.** The receipts and payments account lists payments by activity. The dashboard tags each expense with programme, optional project and event, and an account head from the expense categories (Resource Cost, Procurement, Transportation, Food or Refreshment, Logistics, Others, Scholarship). Can those columns build the activity lines? List any fixed heads needed (audit fees, website hosting, depreciation).
4. **Depreciation.** **Proposal**: the CA calculates it at year end and the dashboard records the figure; it never computes depreciation.
   - **Founder**: as proposed. Built: the treasurer enters the signed figures (Audited figures); a fixed asset carried at less posts as depreciation.
5. **Audit fee provision of 10,000.** Does the FY 2025-26 fee, paid in FY 2026-27, clear the opening liability rather than count as expense?
   - **Founder** (17 October 2026): the payment clears the provision and any excess is expense, as built (section 3). This replaces an earlier answer to expense it. Built fallback: a write-back in the signed statements is entered with the audited figures, under `Year-end adjustments (audited) — income` by default. CA to confirm the head.
6. **Column headers in the signed I&E** read "31-March-2025" and "31-March-2024" for FY 2025-26 and FY 2024-25 figures. Is a corrected copy needed?
7. **Opening figures.** Confirm every amount in section 2, the per-asset WDV rates (and gross and accumulated depreciation, if available), and that there were no payables, advances, receivables or gateway balances at 31 March 2026.
8. **TDS.** Does the trust deduct TDS on any payments, and under which sections?
   - **Founder**: none; the withholding fields stay unused.
9. **Fixed deposit interest.** Credited to the current account or the deposit; cash or accrual? Share the FD's start date, maturity and rate.
   - **Founder**: credited to the current account, recorded when credited, no accrual.
10. **CSR money.** General Fund, or a separate restricted fund tracked against the CSR agreement?
    - **Founder**: General Fund; spending is tracked by programme and project.
11. **80G receipt numbering.** Gateways send their own receipts, so the dashboard numbers direct gifts only. Is `PI/2026-27/0001` (one gap-free series per year) acceptable, and must hand-issued receipts be carried in?
    - **Founder**: yes, starting at 0001; none were issued by hand.

Also confirmed by the founder as built (17 October 2026), for CA review:

- Claims payable and negative payables for payments before approval.
- The money-date cutover for claims and vendor payments.
- Supplier advances until the invoice is accepted.
- The refund cutover rule of question 1.
- Form 113: voluntary gifts in the "Specific grant" row, as the portal's codes have it.
- Audited figures defaults: write-backs to income, every adjustment in the General Fund, a fixed asset carried at less is depreciation.

## 5. CA handoff workbook (XLSX)

Finance → Books → Download CA workbook. One workbook per financial year, one sheet per export, XLSX only (no Tally XML), account head names are the dashboard's own. Amounts in rupees with two decimals; dates dd-MM-yyyy; in-kind lines labelled and kept out of cash totals. Every row carries its document reference.

| Sheet | One row per | Columns |
|---|---|---|
| Receipts and payments | Cash book movement | Date, account, direction, kind (receipt, payout, transfer, refund, fee, tax payment, opening), amount, party, payment reference or UTR, programme, project, account head, document type and reference, linked transfer reference, bank statement matched, Movement ID, Memo. Each account sits between balance brought forward and carried forward rows |
| Income and expenditure | Recognition entry | Economic date, posted date, account head, income or expense, amount (decreases negative), programme, project, event, cost centre, fund, party, medium (monetary or in-kind), document type and reference, reversal of, backfilled, Entry ID, Memo. Also lists opening asset, liability and fund lines |
| Income and expenditure summary | Account head by programme | Head, programme, year total; totals per head and per programme |
| Balance sheet items | Account, fund, asset (one per fixed asset) or liability | Item, opening at 1 April, increases, decreases, closing at 31 March, last bank statement balance and its date. Each fund shows its opening balance plus the year's net (General Fund surplus/(deficit), other funds' additions/(deductions)), as note 5 of the statements |
| Donor list (Form 113) | Donor, donation type and mode | The donations return columns, ID masked to its last four characters, receipt issuer and number, status and reason for excluded gifts. Replaced by a one-line note for readers without a donor permission or `finance.view_sensitive` |

"Backfilled" means dated before the ledger went live (the day opening balances were first posted).

### Later years

- Opening balances are entered once. Closing a year posts nothing; from FY 2027-28 each fund opens with its balance plus every earlier year's surplus posted to it.
- Once the CA signs a year, the treasurer enters the signed balance sheet at Finance → Books → Audited figures. The CA's year-end corrections (depreciation, write-backs, reclassifications, fund transfers) post as one entry dated 31 March, so the year closes and the next opens at the audited figures. Money accounts are never adjusted; a difference there means records are missing. Once matched, the year is frozen until the figures are reversed.
- Reopening a year and posting into it changes every later year's openings, so a later workbook the CA has signed can differ from a fresh download. Keep the signed copy.

## 6. What the founder supplies

1. **Payments since 1 April 2026 without proof.** For each, the payment date, paying account and bank reference, or mark it unpaid.
   - Reimbursements: the "Missing payment proof" filter on Reimbursements and the "No payment screenshot" rows on Waiting to post, which link to Add payment proof. Adding proof posts the claim on its approval day; an unpaid claim is voided. A claim with proof but no recorded approval day waits separately.
   - Vendor payments: no dedicated list; payments show up through bank debit matching on the bank statements page.
2. **Organisation accounts**: confirm the current account and add the FD as a `deposit` account.
3. **Bank statements from 1 April 2026** for the current account, imported so backfilled entries can be matched.
4. **FD evidence**: start date, amount, maturity and interest credited since 1 April 2026.
5. Any other money in or out since 1 April 2026 not yet recorded.

## 7. Sign-off

| | Name | Date | Signature or confirmation |
|---|---|---|---|
| Founder | | | |
| Chartered accountant (GVNKA & Associates) | | | |

Sign-off covers sections 1 to 5. The opening-balance document is then entered with the CA's name and date.
