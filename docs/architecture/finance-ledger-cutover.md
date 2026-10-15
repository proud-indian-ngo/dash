# Finance Phase 0: ledger cutover contracts

> **Status**: draft for founder and CA review (14 October 2026). Phase 3 layer 1 builds the opening-balance document, the `deposit` account kind and the year close (founder go-ahead 14 October 2026; see "Books (layer 3-1)" in `finance-and-programmes.md`); layer 3-2 implements the income rows of section 3 with the founder's answers in section 4, still pending the CA's confirmation (see "Income posting (layer 3-2)"); layer 3-3a implements the reimbursement, vendor invoice, vendor payment and TDS rows (see "Expense posting (layer 3-3a)"); layer 3-3b matches bank debits to them, so a payment's account and date follow the bank statement from the cutover, and posts bank charges and tax payments from the statement (see "Bank debit matching (layer 3-3b)"); the rest fixes what later Phase 3 layers build and what Phase 4 exports. Items marked **Proposal** need sign-off; items under "Questions for the CA" need an answer before the ledger is switched on.
> **Load when**: ledger cutover, opening balances, posting rules in plain language, backfill of FY 2026-27, CA handoff workbook columns, fixed deposit account, audited FY 2025-26 figures.
> **Related**: `finance-and-programmes.md` (sections 2, 3.8, 3.13 and 5), `vendor-payments.md`

This note is for the founder and the chartered accountant (CA). It says from which day pi-dash keeps the books, which balances it starts from, how each everyday event is recorded, and what the CA receives at year end. pi-dash stays an operational record that feeds the CA (`finance-and-programmes.md` section 2): the CA still keeps the statutory books and signs the statements.

## 1. Cutover

The founder chose **1 April 2026**, the first day of FY 2026-27, as the day the pi-dash ledger starts. Opening balances come from the audited FY 2025-26 statements (GVNKA & Associates, signed 30 September 2026).

Two ranges that never overlap:

| Range | Dates | Where the books are | In the pi-dash ledger? |
|---|---|---|---|
| Historical | up to 31 March 2026 | The CA's books and the audited statements | No. Only the closing balances enter, once, as opening balances |
| Live | from 1 April 2026 | pi-dash, handed to the CA each year | Yes |

Rules:

1. Nothing dated before 1 April 2026 is ever posted. A record dated earlier (a contribution, a reimbursement, a vendor payment) stays in pi-dash as history and is never turned into ledger entries. The audited balances already contain it.
2. Nothing dated on or after 1 April 2026 is left out of the ledger once the ledger is switched on.
3. The opening balances are posted once, dated 1 April 2026, from figures the CA confirms in section 2. They can be changed only by a correction that the CA has confirmed (`finance.adjust`, with a reason).

### Backfill from 1 April 2026 to go-live

The ledger is switched on in Phase 3, months after 1 April 2026. Activity in between is backfilled **only from evidence pi-dash already holds or the founder supplies**, never from memory or estimates. pi-dash already holds:

| Evidence | Where it is in pi-dash | What it backs |
|---|---|---|
| Contributions recorded by hand or imported (generic CSV, give.do CSV) | Income page, `contribution` | Donation income |
| Razorpay payments, with fee and GST | Razorpay ingestion, `contribution` with an external identity | Donation income and gateway fees |
| Razorpay refunds | `contribution_refund` | Refunds to donors |
| Razorpay settlements and their lines | Income → Settlements, `gateway_settlement` and items | Money moving from Razorpay to the bank |
| give.do payouts and their lines | Income → Settlements, `gateway_settlement` (provider give.do) | Money moving from give.do to the bank |
| Bank statement lines, credits and debits, with closing balance | Bank statements page, `statement_line` | Proof that money reached or left the bank |
| Other income (such as FD interest) | Income page, `other_income` | Other income |
| Approved reimbursements | Reimbursements, status approved, with the payment screenshot attached at approval | Expense and payment. Approval is given only after the claimant has been paid, and the approver attaches the payment screenshot, so an approved reimbursement is a paid one: the screenshot is the payment evidence and the approval date is the default payment date. Approved reimbursements without a screenshot (older records) are listed for the founder (section 6) |
| Vendor payments and their recorded payment transactions (date, method, reference) | Vendor payments, `vendor_payment_transaction` | Expense and the payment |
| Legacy advance payments | Read-only history | Nothing posts from them (advances were discontinued). The audited balance sheet shows no advances outstanding at 31 March 2026 |

**Proposal**: a backfill posting keeps the document's own economic date (the gift date, the approval date, the payment date) and is marked as backfilled, so the CA can see which entries were made after the fact. A payment with no evidence is not posted; it goes on the founder's list in section 6.

## 2. Opening balances at 1 April 2026

From the audited balance sheet at 31 March 2026, in rupees.

| Audited line | Amount (₹) | Goes into pi-dash as | How it is posted (**Proposal**) |
|---|---|---|---|
| Cash at bank (current account) | 4,00,648 | The existing bank `org_account` for the current account | One opening movement into that account |
| Deposits at bank (fixed deposit) | 7,00,000 | A separate `org_account` for the fixed deposit (see below) | One opening movement into that account |
| Property, plant and equipment, net (WDV) | 4,391 | Three opening asset lines, one per asset (see below) | One opening recognition line per asset, under an asset account head |
| **Total assets** | **11,05,039** | | |
| Corpus Fund | 1,001 | A new fund "Corpus Fund" (restriction: restricted) | Opening fund balance line |
| General Fund | 10,94,038 | The seeded "General Fund (Domestic)" | Opening fund balance line |
| Short-term provisions: audit fees payable | 10,000 | A liability account head "Audit fees payable" | Opening liability line |
| **Total funds and liabilities** | **11,05,039** | | |
| Razorpay and give.do clearing balances | 0 | The two `gateway_clearing` accounts | No opening line (the audited balance sheet shows no gateway balance) |
| Vendor payables, supplier advances, staff or volunteer advances, receivables | 0 | None | No opening line (none in the audited balance sheet) |

**Balancing check**: assets 4,00,648 + 7,00,000 + 4,391 = **11,05,039**; funds and liabilities 1,001 + 10,94,038 + 10,000 = **11,05,039**. The General Fund is the opening 4,45,052 plus the FY 2025-26 surplus of 6,48,986.

**Built (layer 3-1)**: a finance admin (`finance.post_opening`) enters the figures at Finance → Books → Opening balances (`/finance/books/opening`); pi-dash never seeds or hard-codes them. The document lists the accounts, one line per fixed asset (its name in the line), the liabilities and each fund; account lines become opening movements, the rest opening entries under the `Fixed assets`, `Audit fees payable` and `Fund balance` heads. A correction reverses the whole document and posts a new one. The evidence upload of the signed statements is not built yet. Original proposal: the opening balances are entered as one opening-balance document listing every line above. It cannot be posted unless its assets equal its funds plus liabilities, and it carries the CA's confirmation (name and date) before posting. Today's posting table (`finance-and-programmes.md` section 3.8) has only "opening in" movements for cash; this document extends it to the fund, liability and asset lines, which are recognition-side opening lines with no money movement.

### The fixed deposit

**Built (layer 3-1)**: org accounts have a `deposit` kind for fixed deposits ("Fixed deposit" in Settings → Organisation accounts), so the FD:

- never appears as a "deposited into" choice for donations and never takes bank statement imports;
- gets its money only by transfer: placing an FD is a transfer out of the current account into the FD account, and a maturity or premature closure is a transfer back;
- earns interest that is recorded as other income (`other_income`, kind interest), never as a donation.

The contribution form, the contribution mutator and income imports refuse a deposit account, and bank statements only list bank accounts. Transfers between the current account and the FD post from the current account's bank line marked as a transfer with the FD as the other account (built in layer 3-2; layer 3-3a adds nothing for them).

The audited figures show FD interest of 3,817 as income on accrual. No accrued interest receivable appears at 31 March 2026, so nothing opens for it.

### The fixed assets

The audited schedule shows gross 27,842, accumulated depreciation 23,451 and net 4,391 across three tangible assets, depreciated on the written-down value (WDV) method at Income-tax Act rates:

| Asset | Net at 31 March 2026 (₹) | WDV rate |
|---|---|---|
| Tailoring machine | 3,986 | From the CA's schedule |
| Croma speaker | 332 | From the CA's schedule |
| Solar power bank equipment | 73 | From the CA's schedule |
| **Total** | **4,391** | |

The fixed asset register itself waits for Phase 5 (founder answer, `finance-and-programmes.md` section 6). **Proposal**: post one opening asset line per asset now, naming the asset in the line's description, so the register can adopt them later without changing posted data. The CA is asked for the gross and accumulated depreciation per asset if the register should carry them.

## 3. Posting rules in plain language

Every business event below is recorded in up to two books, which are never added together:

- **Recognition** (income and expenditure): what the trust earned or spent, tagged with programme, project, event, fund and account head.
- **Cash book** (money movements): money that actually came into or left one of the trust's accounts (the bank account, the FD, cash, or the Razorpay and give.do clearing balances).

Restated from the trigger table in `finance-and-programmes.md` section 3.8:

| Business event | Recognition | Cash book |
|---|---|---|
| A donor gives through Razorpay or give.do and the gateway captures it | Donation income at the full amount; the gateway's fee and the GST on it as expense | Full amount into the gateway's clearing balance; fee and GST out of it |
| Razorpay or give.do pays its balance into the bank | Nothing (no new income) | Transfer out of the clearing balance, into the bank, at the net amount |
| A donor gives directly by bank transfer, UPI, cheque or cash | Donation income | Into the account it was deposited in |
| Other income arrives (FD interest, a grant returned, other) | Other income | Into that account |
| An acknowledgement or invoice is sent to a corporate or Goodera | Nothing (section 8 item 2 of the finance chapter: engagement money is a donation, recognised when received) | Nothing |
| A donor is refunded | Donation income reduced | Refund out of the account it is paid from |
| An in-kind gift arrives | In-kind income at fair value, and either an expense when it is used or an asset when it is kept | Nothing, labelled in-kind in the CA's workbook |
| A reimbursement is approved (it has already been paid; the payment screenshot is attached) | Expense per line | Out of the main bank account (the trust deals in no cash), on the payment date (default: approval date) |
| A vendor payment is paid and the payment confirmed | Nothing (already recognised) | Out of the account it was paid from |
| A vendor invoice is accepted | Expense (or an asset for equipment) at the invoice amount less any GST we can recover, and the recoverable GST as an asset. The trust is not GST-registered, so today this is the full invoice amount | Nothing |
| Tax is deducted from a vendor payment (TDS) | Nothing; the amount owed to the government is tracked on the deduction | Nothing |
| The deducted tax is paid to the government | Nothing | Out of the bank, as a tax payment |
| Money moves between the trust's own accounts (bank to FD, FD to bank, cash to bank) | Nothing | Out of one account and into the other, linked |
| A mistake is corrected | The wrong entry reversed and the right one added | Only if money really moved |
| Opening balances at 1 April 2026 | Opening fund, liability and asset lines (section 2) | Opening amounts into the bank and FD accounts |

**Implemented for income (layer 3-2, founder answers, CA confirmation pending).** The income rows above post automatically, by the rules in `packages/db/src/ledger/income-rules.ts` (one module, so a change the CA asks for is a one-place edit):

- A gateway gift is income on the donor's payment date at the full amount. Razorpay's fee and GST are an expense at the gift; give.do's charges are an expense on the payout day, from the payout file. No TDS, no cash.
- A gift captured before 1 April 2026 whose payout reached the bank on or after it posts on the payout's bank day as FY 2026-27 income (question 1, item 4); one paid out before 1 April never posts.
- A refund made before 1 April 2026 of such a gift, taken back by a payout that reached the bank on or after 1 April, posts on that payout's bank day too, for the same reason (no gateway balance at 31 March 2026). Founder rule; **CA to confirm**.
- The payout is a transfer of the net amount out of the clearing account into the bank account its bank statement line is matched to (else the only active bank account), on that line's date (else the settlement date).
- A refund dated on or after 1 April 2026 reduces FY 2026-27 donation income on its own day, even for an earlier gift (question 1, item 6).
- An in-kind gift is in-kind income and an equal in-kind consumption expense (used as received; keeping it as an asset comes later).
- A corpus gift (donation type corpus: the donor's written direction that it form part of the corpus) is a capital receipt, not income: it is credited straight to the Corpus Fund (`Corpus donations`, a fund head) and stays out of the I&E and the year's surplus; the balance sheet items show it as the Corpus Fund's additions during the year. The corpus type decides the fund (a corpus gift is always the Corpus Fund's, and only corpus gifts are). Gateway charges on a corpus gift are a General Fund expense in the I&E, so the Corpus Fund keeps the gross the donor gave; a refund reduces the Corpus Fund. Founder decision (16 October 2026), replacing the earlier treatment as `Donations received`. Corpus gifts already posted are reversed and reposted under this rule on the next posting run, except in a closed year, where they wait until it is reopened. Open for the CA: an in-kind corpus gift still follows the in-kind rule (income and an equal consumption).
- FD interest (other income of kind interest, or anything credited to the fixed deposit) is `Interest on fixed deposit`, as it is credited; question 9 (accrual) is still open.
- Moving money between the current account and the FD posts once the reviewer marks the bank line as a transfer and picks the other account; between two bank accounts, from whichever side is marked first, once.
- A reversed gift posts nothing (like a pending one); a refunded gift posts its receipt and its refunds.
- A correction is a reversal plus a new posting. A classification change (programme, project, fund, donor) reverses and reposts the income line only; a change to the amount, date or account reverses and reposts the money too.
- Records that can't post yet (year closed, the bank account not known, a missing account head) wait on the Books page's "Waiting to post" list with the reason; closing a year is blocked while any of its records wait.

**Implemented for expenses (layer 3-3a, CA confirmation pending).** The reimbursement and vendor rows above post automatically, by the rules in `packages/db/src/ledger/expense-rules.ts`:

- An approved reimbursement is an expense per line, under its expense category's account head, with the programme, project and event it is charged to and the General Fund, and one payment out of the main bank account, both on the approval day (pi-dash records no separate payment date). One without a payment screenshot waits on the Books page's "Waiting to post" list (section 6).
- A vendor invoice is an expense per line at the full amount when its invoice (or the reason for having none) is approved, on that day; each approved payment is money out of the main bank account on its date. Because pi-dash takes the invoice only after payment, each payment is held as a supplier advance (an asset, finance chapter section 3.6) until the invoice is accepted, which clears it by the invoice's amount (an overpayment stays on the advance; an invoice above the approved payments waits until they agree). A request paid entirely before 1 April 2026 stays history, since the audited balance sheet holds no supplier advances; one paid on both sides of that date waits for the CA. **CA to confirm.** The trust is not GST-registered and deducts no TDS, so neither posts anything.
- "The main bank account" is the account marked so in Settings → Organisation accounts, or the only active bank account.
- **Built (layer 3-3b).** Once a bank statement debit is matched to a reimbursement or vendor payment, its money out follows the bank: the line's account and value date, split across debits when several paid it; unmatching puts it back on the main bank account and the approval or payment day. A debit with no document is marked as bank charges (expense, `Bank charges` head) or a tax payment (expense, `Taxes and government fees` head, for the CA to classify; not a TDS remittance, as the trust deducts none). Statement lines before 1 April 2026 are evidence only. The cutover follows the money, since the audited FY 2025-26 accounts are cash-basis for payments: a claim or vendor payment whose bank debits are all before 1 April 2026 is history and posts nothing, even if approved after it; one approved before it but debited on or after it posts on the debit day; debits on both sides wait for the CA. An approved reimbursement is recognised as an expense on its approval day, with a "Claims payable" liability raised that day and cleared by each payment on the day the money left, so the books balance on every day in between (a payment before the approval shows as a negative payable, an advance to the claimant). A vendor payment's supplier advance is dated with its money. **CA to confirm.**
- The audit fee follows the founder's answer to question 5: its payment posts as FY 2026-27 expense like any other vendor payment. The opening liability stays until the CA advises; a write-back would be an adjustment (layer 3-3c).
- Nothing approved, accepted or paid before 1 April 2026 posts. A correction is a reversal plus a new posting, as for income.

Two consequences the CA should see:

- Each posting is final. A change is a reversal plus a new entry, so the CA's workbook always shows both.
- Advance payments are discontinued and never post. Approval-time expense for reimbursements and acceptance-time expense for vendor invoices follow the accrual basis in the accounting policy; the cash book shows when the money left.

## 4. Questions for the CA

Founder's answers (14 October 2026) are shown under each question as **Founder**; the CA confirms or corrects them.


1. **Which day counts as "receipt" for gateway donations, and gross or net?** The accounting policy says "Donations are recognised on receipt basis". pi-dash's design records a Razorpay or give.do gift as income on the day the gateway captures it, at the full amount, with the gateway's fee as an expense, and treats the later payout into the bank as a transfer (section 3).
   1. Please confirm whether "receipt" for a gateway gift is the **capture date** (the donor paid the gateway) or the **bank credit date** (the gateway paid the trust).
   2. Please confirm whether you want gifts shown **gross with the fee as an expense** (pi-dash's design) or **net of fees**.
   3. Consequence for gifts captured in March 2026 and paid into the bank in April 2026: the audited balance sheet shows no gateway balance at 31 March 2026, which suggests these gifts were not in FY 2025-26 income and count as FY 2026-27 income when they reached the bank. Please confirm.
   4. **Proposal** for those gifts, if 3 is confirmed: pi-dash posts them in FY 2026-27, dated the day the payout reached the bank, as income at the full amount with the fee as expense, and the payout as a transfer the same day, so the clearing balance opens and stays at zero. pi-dash will list every such gift from its Razorpay and give.do payout records.
   5. Linked question: pi-dash's donations return (Form 113) for FY 2026-27 currently leaves out every gift dated before 1 April 2026, on the basis that it was receipted and filed outside pi-dash. If the gifts in 3 are FY 2026-27 receipts, should they go into the FY 2026-27 donations return instead, and were 80G receipts already issued for them?
   6. A refund in FY 2026-27 of a gift received before 1 April 2026: **Proposal**: post it as a reduction of FY 2026-27 donation income, dated the refund day. Please confirm or advise.
   - **Founder**: the donor's payment date (capture date), shown gross with the gateway fee as an expense. Because the audited balance sheet shows no gateway balance at 31 March 2026, the cutover rule in item 4 still applies to gifts captured in March 2026 and paid out in April 2026: they are FY 2026-27 income, dated their payout day, so no gift falls between the two years.
2. **Income presentation.** The audited statements show all income as "Donations received", including money from corporate engagements, and the finance chapter keeps that treatment (section 8 item 2). Should the FY 2026-27 workbook keep a single "Donations received" line, or do you want sub-lines (such as CSR, through Goodera, individual)? pi-dash records the donation type and channel on every gift, so either is possible.
3. **Expense heads.** The receipts and payments account lists payments by activity (Mumbai School Transformation, Kalakriti 2.0, gift distribution, students' school fees, Art with Elderly – JP Morgan, volunteer t-shirts, PI Community Centre, audit fees, website hosting, transportation, and others). pi-dash tags every expense with a programme, an optional project (an edition, a class, a drive or a corporate engagement), an optional event, and an account head taken from today's expense categories (Resource Cost, Procurement, Transportation, Food or Refreshment, Logistics, Others, Scholarship). Are you happy to build those activity lines from the programme, project and event columns plus the account head in the workbook? If you need fixed heads (audit fees, website hosting, depreciation), please list them and pi-dash will add them as account heads.
4. **Depreciation.** **Proposal**: you keep calculating depreciation at year end, as now, and pi-dash records your figure as one adjustment per asset (permission `finance.adjust`, with a reason quoting your schedule), so pi-dash's asset lines agree with your books. pi-dash does not compute depreciation itself.
   - **Founder**: the CA calculates it at year end (the proposal).
5. **Audit fee provision of 10,000.** **Proposal**: when the FY 2025-26 audit fee is paid in FY 2026-27, the payment clears the opening liability and is not FY 2026-27 expense. The FY 2026-27 audit fee is provided for by you at year end, recorded in pi-dash as an adjustment. Please confirm.
   - **Founder**: treat the payment as FY 2026-27 expense. For the CA: the opening balance carries a 10,000 audit fee liability; if the payment is booked as expense, that liability has to be written back (or the opening figure changed), otherwise it stays on the balance sheet and the fee is counted twice. Please advise which.
6. **Column headers in the signed I&E.** The income and expenditure account's column headers read "31-March-2025" and "31-March-2024", although the figures are for FY 2025-26 and FY 2024-25. Is a corrected copy needed for the record?
7. **Opening figures.** Please confirm every amount in section 2, the per-asset WDV rates (and gross and accumulated depreciation per asset, if available), and that there were no payables, advances, receivables or gateway balances at 31 March 2026.
8. **Tax deducted at source on payments.** pi-dash can record TDS withheld on a vendor or contractor payment (for example a contractor paid per event) and the later payment to the government. Does the trust deduct TDS on any payments today, and under which sections? If none, the withholding fields stay unused.
   - **Founder**: the trust deducts no TDS today; the withholding fields stay unused.
9. **Fixed deposit.** How is FD interest received (credited to the current account, or added to the deposit), and should interest be recorded as it is credited (cash) or accrued at year end, as the accounting policy suggests? Please share the FD's start date, maturity date and rate so renewals can be recorded.
   - **Founder**: please advise (open).
10. **CSR money.** A company's CSR gift is recorded as a donation (Specific grant) in the donations return. Should CSR receipts sit in the General Fund like other donations, or in a separate restricted fund that tracks how the money is spent against the CSR agreement?
   - **Founder**: General Fund, like other donations; spending is tracked through programme and project.
11. **80G receipt numbering.** Razorpay and give.do already send receipts for their gifts, so pi-dash will number receipts only for direct bank transfers. Is a series such as `PI/2026-27/0001` (one series per financial year, no gaps) acceptable, and does any receipt issued by hand since 1 April 2026 need to be carried into it?
   - **Founder**: yes, `PI/2026-27/0001`, starting at 0001; no receipts were issued by hand since 1 April 2026.

## 5. CA handoff workbook (XLSX)

**Implemented (layer 3-5), for the CA to review.** Finance → Books → Download CA workbook (XLSX); details and decisions in "CA handoff workbook (layer 3-5)" of `finance-and-programmes.md`. Differences from the table below: each account's movements sit between a balance brought forward and a balance carried forward row; Movement ID, Entry ID and Memo columns follow the contract's columns; the income and expenditure sheet also lists the opening asset, liability and fund lines (marked Asset, Liability or Fund); "Backfilled" means dated before the ledger went live (the day the opening balances were first posted); the balance sheet items add the bank statement balance and its date as two columns, one item per fixed asset, and income less expenditure rolled into the fund it is posted to (the General Fund for unrestricted income), each such fund shown as its opening balance plus the year's net figure (the General Fund's current year surplus/(deficit), another fund's additions/(deductions) during the year; the gross figures are in the income and expenditure sheets), as note 5 of the audited statements; the donor list keeps the ID masked to its last four characters for everyone, carries the receipt issuer and number, and is left out (a one-line note) for book readers without a donor permission or `finance.view_sensitive`.

**The next year.** Opening balances are entered once, for the cutover year. Closing a year posts nothing: from FY 2027-28 on, each fund opens with its fund balance plus every earlier year's surplus or deficit posted to it, so the General Fund carries each year's surplus as note 5 of the statements does, and the next year needs no opening-balance entry. Nothing is frozen at close either: reopening FY N and posting into it changes the openings of every later year, so a later year's workbook the CA has already signed can drift from a fresh download; keep the signed copy.

One workbook per financial year, one sheet per export (`finance-and-programmes.md` sections 3.13 and 6: XLSX only, no Tally XML; the account head names are pi-dash's own). Amounts are in rupees with two decimals; dates are dd-MM-yyyy; in-kind lines are labelled and kept out of cash totals. Every row carries the pi-dash document reference so the CA can ask about a single entry.

| Sheet | One row per | Columns |
|---|---|---|
| Receipts and payments | Cash book movement | Date, account (bank, FD, cash, Razorpay clearing, give.do clearing), direction (in or out), kind (receipt, payout, transfer, refund, fee, tax payment, opening), amount, party name, payment reference or UTR, programme, project, account head, document type and reference, linked transfer reference, bank statement matched (yes or no) |
| Income and expenditure | Recognition entry | Economic date, posted date, account head, income or expense, amount (decreases negative), programme, project, event, cost centre, fund, party name, medium (monetary or in-kind), document type and reference, reversal of (reference, if a correction), backfilled (yes or no) |
| Income and expenditure summary | Account head by programme | Account head, programme, total for the year; with totals per head and per programme |
| Balance sheet items | Account, fund, asset or liability | Item, opening at 1 April, increases, decreases, closing at 31 March (bank and FD closing also shown against the last bank statement balance) |
| Donor list (Form 113) | Donor, donation type and mode, as in the return | The donations return columns already shipped (`finance-and-programmes.md`, layer 3e), with the ID masked to its last four characters, plus status and reason for gifts left out |

## 6. What the founder supplies

1. **Payments since 1 April 2026 without proof in pi-dash.** pi-dash will generate the list: approved reimbursements with no payment screenshot attached (older records; newer approvals carry the screenshot as payment proof) and vendor payments with no payment transaction or no matching bank debit line. For each, the founder gives the payment date, the account it was paid from and the bank reference, or marks it unpaid. *Status (reimbursements): built.* The list is the Reimbursements filter "Missing payment proof" (and its count button), and the Books Waiting to post list, whose "No payment screenshot" rows link to the claim with Add payment proof. Adding the screenshot posts the claim on its approval day out of the main bank account; a claim actually unpaid is voided instead. A claim with proof but no approval day recorded waits separately ("The approval date isn't recorded"). Vendor payments: still to come with bank matching (layer 3-3b).
2. **Accounts in Settings → Organisation accounts.** Confirm the current account and add the fixed deposit as its own account (section 2), so the opening balances have somewhere to go.
3. **Bank statements from 1 April 2026** for the current account, imported on the Bank statements page, so every backfilled payment and gift can be matched.
4. **Fixed deposit evidence**: the FD's start date, amount, maturity date and interest credited since 1 April 2026.
5. Any other money in or out since 1 April 2026 that is not in pi-dash (for example bank charges or a gift not yet recorded).

## 7. Sign-off

| | Name | Date | Signature or confirmation |
|---|---|---|---|
| Founder | | | |
| Chartered accountant (GVNKA & Associates) | | | |

Sign-off covers the cutover date and ranges (section 1), the opening balances (section 2), the posting rules (section 3), the answers in section 4 and the workbook columns (section 5). Once signed, the opening-balance document is entered with the CA's name and date.
