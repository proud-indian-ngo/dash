# Finance: bank statements and matching

Bank statement imports, matching credits to settlements, contributions and give.do payouts, and matching debits to reimbursements, vendor payments and bank charges.

Overview in [finance-and-programmes.md](finance-and-programmes.md); the records being matched in [finance-income.md](finance-income.md) and [vendor-payments.md](vendor-payments.md); posting in [finance-books.md](finance-books.md).

## Bank statement lines and matching

Reading needs `finance.view` or `finance.manage`; importing and every action need `finance.manage`. Code starts in `apps/web/src/lib/bank-statement/`.

### Import

- Uses the income importer's flow, retention and keyed hashes. The mapping is remembered per bank account. There is no bank-specific preset yet.
- Narrations are masked for PAN and Aadhaar shapes. The reference is taken from the file, or else the first UPI/IMPS RRN or NEFT/RTGS UTR in the narration.
- A keyed hash of the line's facts and its occurrence is unique per account, so overlapping uploads never duplicate.
- Lines keep file order, oldest first, so the last line gives the closing balance.

### Credit matching

A credit is matched whole, to one settlement, one contribution, or a kind (give.do payout, transfer). In order:

1. A processed settlement (Razorpay of the server's mode, or give.do) whose UTR is a whole token of the reference or narration and whose net equals the amount matches automatically. Same amount within ±3 days is suggested.
2. A direct contribution into this account, same amount, within ±3 days and same reference matches; with a reference missing on either side it is suggested; different references never pair.
3. A narration naming GiveIndia or give.do is suggested as a give.do payout.

A turned-down suggestion is remembered. Actions are audited with IDs only. A line never creates a donation on its own: "Record as donation" saves a contribution and the match in one mutation and needs `donors.manage` as well.

## Bank debit matching and bank charges

Each debit is linked to what it paid: approved reimbursements, approved vendor payments, bank charges, a tax payment, or a transfer. From the cutover a match corrects the books (account and date follow the bank); before it, a match is evidence only.

- `statement_allocation` links a line to documents, not movements, because movements are reposted at every revision; the engine writes `movement_allocation` from them. Unmatched allocations are released, never deleted. A line is matched when live allocations equal its amount.
- Suggestions are documents whose unpaid amount equals what is left of the debit, UTR matches first. Nothing matches automatically. The server re-plans under the statement line lock and refuses anything no longer approved, voided or already paid.
- Ignore is allowed only for debits before the cutover.
- A record a live allocation pays can't be voided, deleted, rejected or reset (`assertNotMatchedToBank`). Matches touching a closed or matched year are refused.
- The "Not in bank" tab lists approved claims and payments since the cutover that no debit fully pays.
- Actions are audited with IDs and counts only.
