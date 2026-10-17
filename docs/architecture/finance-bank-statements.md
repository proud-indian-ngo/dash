# Finance: bank statements and matching

Bank statement imports, matching credits to settlements, contributions and give.do payouts, and matching debits to reimbursements, vendor payments and bank charges.

Overview in [finance-and-programmes.md](finance-and-programmes.md); the records being matched in [finance-income.md](finance-income.md) and [vendor-payments.md](vendor-payments.md); posting in [finance-books.md](finance-books.md).

## Bank statement lines and matching

`/income/bank` (`finance.view` or `finance.manage` to see, `finance.manage` to import and act). Schema `packages/db/src/schema/statement-line.ts`; code `apps/web/src/lib/bank-statement/`, `apps/web/src/functions/bank-statements.ts`.

### Import

- Same four-step importer (`/income/bank/import`, source `bank_csv`), retention and keyed hashes. The mapping is remembered per bank account and accepts withdrawal/deposit columns, a signed column, or an amount with Dr/Cr. Non-transaction rows are skipped with a reason. No bank-specific preset yet.
- `statement_line` (synced to finance holders only): narration masked for PAN/Aadhaar shapes; reference as given, or the first UPI/IMPS RRN or NEFT/RTGS UTR in the narration. A keyed hash of the line's facts and its occurrence is unique per account, so overlapping uploads never duplicate.
- Lines keep file order, oldest first, so the last line gives the closing balance.

### Credit matching

A credit is matched whole, held on the line (`matched_settlement_id`, `matched_contribution_id`, each unique, or a kind: give.do payout, transfer). In order:

1. A processed settlement (Razorpay of the server's mode, or give.do) whose UTR is a whole token of the reference or narration and whose net equals the amount matches automatically. Same amount within ±3 days is suggested.
2. A direct contribution (UPI, NEFT, cheque, cash) into this account, same amount, within ±3 days and same reference matches; with a reference missing on either side it is suggested; different references never pair.
3. A narration naming GiveIndia or give.do (`GIVEINDIA_NARRATION_PATTERNS`) is suggested as a give.do payout.

Reviewers accept or turn down ("Not this" is remembered), link by hand, mark a give.do payout or a transfer between own accounts, ignore with a reason, note or unmatch, each audited as `statement_line.<action>` with IDs only. "Record as donation" saves a prefilled contribution and the match in one mutation (`donors.manage` and `finance.manage`). A line never creates a donation on its own.

## Bank debit matching and bank charges

Each debit is linked to what it paid: approved reimbursements, approved vendor payments, bank charges, a tax payment, or a transfer. From the cutover a match corrects the books (account and date follow the bank); before it, a match is evidence only.

- `statement_allocation` (line, `kind` `reimbursement` / `vendor_payment_transaction` / `bank_charges` / `tax_payment`, target, amount, `released_at` once unmatched; released rows stay). A line is matched (`match_kind` `expense`) when live allocations equal its amount; until then it is part matched. Allocations link to documents, not movements, because movements are reposted at every revision; the engine writes `movement_allocation` from them.
- Suggestions (`apps/web/src/lib/bank-statement/debit-match.ts`): documents whose unpaid amount equals what is left of the debit, UTR matches first, then within 10 days, three at most. Nothing matches automatically. "Find match" allows multi-select; a short selection leaves the rest open or records it as bank charges. The server re-plans under the statement line lock and refuses anything no longer approved, voided or already paid.
- Quick actions: Bank charges, Tax payment, Mark as transfer, Needs a claim, Unmatch. Ignore only for debits before the cutover.
- A record a live allocation pays can't be voided, deleted, rejected or reset (`assertNotMatchedToBank`). Matches touching a closed or matched year are refused.
- The "Not in bank" tab lists approved claims and payments since the cutover that no debit fully pays.
- Reads need `finance.view` or `finance.manage`; writes, suggestions and Find match need `finance.manage`. Audited as `statement_line.match_debit`, `dismiss_debit`, `bank_charges`, `tax_payment`, `needs_claim`, `clear_needs_claim`, `unmatch` with IDs and counts only.
