# Reimbursements

> **Load when**: reimbursement lifecycle, lead approval, approve, reject, reset, void, edits after approval, `requests.*` permissions, expense categories, saved bank accounts, UPI payout, claim for others, advance payments, financial-year export.
> **Related**: `finance-and-programmes.md` (Charged to), `cash-vouchers.md`, `finance-books.md`, `finance-bank-statements.md`, `file-uploads.md`, `audit-log.md`

A reimbursement repays someone who spent their own money on Proud Indian's work. The lead of the programme it is charged to approves it first ("Approval policy" in [finance-and-programmes.md](finance-and-programmes.md#approval-policy)). Finance then pays the claimant, by bank transfer or UPI, and approves the request with the payment screenshot. Approval therefore means "paid": there is no separate paid status.

## Statuses and transitions

Voiding is a separate flag beside the unchanged status. Mutators live in `packages/zero/src/mutators/reimbursement.ts`.

| Action | From | To | Who | Rules |
|---|---|---|---|---|
| Submit | | `pending` | `requests.create` | Expense date not in the future |
| Edit | `pending` | same | Owner with `requests.edit_own`, or `requests.edit_all` | |
| Edit | any | same | `requests.edit_all_statuses` | See "Edits after approval"; never the lines of your own approved claim |
| Approve as lead | `pending` | same | The programme lead | Records `lead_approved_by` and `_at`; only while the lead step applies |
| Approve | `pending` | `approved` | `requests.approve` | Needs a payment screenshot, new or already stored. With the lead step outstanding, needs a reason; never the lead's own approver, the claimant or the creator |
| Reject | `pending` | `rejected` | `requests.approve`, or the programme lead | Needs a reason |
| Approve or reject from another status | `rejected` / `approved` | the other | `requests.approve` and `requests.edit_all_statuses` | Reject refused while a bank debit is matched |
| Reset to pending | `approved` / `rejected` | `pending` | `requests.edit_all_statuses` | Refused while a bank debit is matched; the screenshot is kept as an attachment; the lead's approval and finance's reason are cleared |
| Void | any | flag set | `requests.void` | Needs a reason; refused while a bank debit is matched |
| Delete | `pending` (owner) or any (`requests.delete_all`) | gone | Owner with `requests.delete_own`, or `requests.delete_all` | Refused once posted, voided or matched |
| Change claimant | any | same | `requests.create_for_others` | Needs a reason |
| Change Charged to | `pending` / `approved` | same | `finance.manage`, or `requests.approve` with `requests.view_all` | Never your own request; refused once posted |

- Every mutator refuses a voided request; voiding twice changes nothing.
- Creating with an existing ID is refused: server creates serialize by table and ID before checking existence. A duplicate fails before payout, children, history or tasks change. This also covers advances, vendor payments and their transactions; the optimistic client checks its local rows.
- While pending, an edit that changes a line or Charged to, or finance re-charging it to another programme, clears the lead's approval.
- Each transition writes a history row and queues posting. The books then post, repost or reverse it; see "Expense posting rules" in [finance-books.md](finance-books.md).
- Role defaults: volunteers can create, view, edit and delete their own requests. `admin` and `finance_admin` can view, edit and delete everyone's. Only `finance_admin` and `super_admin` can approve, void and claim for others. `requests.edit_all_statuses` is left out of both admin roles, so by default only `super_admin` holds it.
- The same delete rule (`assertCanDelete`) covers advance payments, vendor payments and vendor payment transactions.
- Void is offered only once the request is in the books. An unposted request is deleted instead. See "Voiding" in [finance-books.md](finance-books.md).
- Matched bank debits block un-approving. Unmatch the line first; see [finance-bank-statements.md](finance-bank-statements.md).

### Edits after approval

`requests.edit_all_statuses` lets a holder edit an approved or rejected request through the normal form.

- Editing an approved request queues vouchers for opted-in items that are new, changed or still lack one, as approval would.
- An edit after posting reverses and reposts the request.
- Kept payment proof (`payment-proof-replaced-*`, `payment-proof-previous-*`) can be removed only by a `requests.approve` holder.
- Payee signatures survive an edit that drops their file. An item changed after signing loses its signature. See [cash-vouchers.md](cash-vouchers.md).

Adding or replacing the payment screenshot on an approved request is a separate action, `addPaymentProof`. See "Payment proof after approval" in [finance-books.md](finance-books.md).

## Line items, categories and the expense date

- A request has one `expense_date` for all its lines.
- A line can opt into a cash voucher with a payee; see [cash-vouchers.md](cash-vouchers.md).
- Attachments belong to the request, not to a line; see [file-uploads.md](file-uploads.md).
- The request records a City (cost centre): its event's when it is on one, else its own. See "Cost centres" in [finance-and-programmes.md](finance-and-programmes.md).
- Each expense category posts under its own `EXPENSE_<NAME>` account head; see "Account heads" in [finance-and-programmes.md](finance-and-programmes.md). A category used by any line item can't be deleted.

## Payouts: bank accounts and UPI

People save where they want to be paid in Settings → Bank accounts. An entry holds bank details, a UPI handle, or both.

- `upi_id` is a UPI ID or the mobile number linked to UPI. The rules live in `packages/shared/src/payout-account.ts`, shared by the form and the mutator. Custom 8 or 9 digit UPI numbers are refused because they look like account numbers.
- Account numbers and UPI handles are each unique per person. Deleting the default promotes the oldest remaining one. Entries can't be edited; delete and add again.
- Bank account mutators need `bank_accounts.manage_own` and act only on your own entries; nobody manages another person's. Volunteers and unoriented volunteers hold it by default.

### What a request stores

A request copies the chosen entry's details. Later changes to the saved entry don't touch existing requests.

- On your own request the form copies the fields. Picking another entry sends every part, and a part the new entry lacks is sent as `""` and cleared. The mutator checks only the UPI format.
- For someone else, the client sends the entry's ID, and the server copies its details (`claimantBankFields` in `packages/zero/src/mutators/claimant.ts`). The server refuses an entry that isn't the claimant's.

### How finance pays

Finance pays outside the dashboard by bank transfer or UPI, whichever suits them, then approves with the screenshot.

### Storage, reveal and audit

- Payout details are plain text. A reimbursement's copy is not synced, because programme leads see the request: `getReimbursementPayout` (`apps/web/src/functions/reimbursement-payout.ts`) serves it to the claimant and `requests.view_all` holders, and mutators write it on the server. Advance payments still sync theirs.
- Saved entries sync to their owner. `bankAccount.bankAccountsForClaimant` also lets `requests.create_for_others` holders read another person's entries.
- Nothing is encrypted and there is no reveal step, unlike vendor bank accounts. Encrypting payee account numbers on requests is planned under "Data protection" in [finance-and-programmes.md](finance-and-programmes.md).
- Audit metadata records only changed field names, never values; see [audit-log.md](audit-log.md).

## Claim for others

- With `requests.create_for_others`, someone can raise a request for another person.
  - `created_by` records who raised the request. `user_id` is the claimant, who sees it, is notified and is paid into one of their saved bank accounts or UPI.
  - The claimant must be an active member who is not an external user. A claimant with nothing saved can't be claimed for.
- `reimbursement.changeClaimant` moves a request to another claimant at any status, with a reason.
  - `previousUserId` must match the current claimant, so two changes can't race.
  - The payout details become one of the new claimant's saved entries. If they have none, the details are cleared; if they have any, one must be chosen.
  - Vouchers print the claimant, so every voucher and signed copy is unlinked; the files stay among the attachments. An approved request queues fresh vouchers.
  - A posted request is reversed and reposted, because the payout memo names the claimant.

## Charged to

Every reimbursement records the event, programme (with optional project) or organisation it served. New event references on reimbursements and vendor payments require event visibility, the event’s programme lead, `finance.manage`, or both `requests.approve` and `requests.view_all`. Existing references survive membership loss when editing; they do not grant access to private event details. See "Expense Charged to" in [finance-and-programmes.md](finance-and-programmes.md).

## Advance payments

Advance payments are discontinued. Existing records stay as history and never post to the books.

- The table and mutators remain, with the same permissions as reimbursements. Nothing in the UI creates one.
- Existing advances still appear in the reimbursements list and open at `/reimbursements/$id`, where they can be edited, approved or rejected. They have no Charged to, void, claimant change or payee signature.
- Approving an advance also needs a screenshot. A replaced or reset screenshot is deleted rather than kept.

## Financial-year export

`/export` downloads a ZIP from `GET /api/financial-export` (data in `apps/web/src/lib/server/financial-export.ts`).

- It covers one April to March year. Vendor payment files are not included.
- Attachments are preflighted before the response, then opened one at a time as the download reads. A cancelled download cancels its active attachment read.
- Reimbursements are picked by expense date, advances by submission date and vendor payments by invoice date.
- The CSVs carry no payout details.
- It needs `requests.export`, which is reserved for `super_admin` (see [authorization.md](authorization.md)).
- The export is not audited: it is a GET route outside `runSessionAuditedAction`.
- Gotchas: voided requests are included with their unchanged status and no void column. "Created By" is the claimant's name, not `created_by`.

## Notifications

Jobs are enqueued after commit from the mutators; delivery is described in [notifications.md](notifications.md).

| Event | Reaches |
|---|---|
| Submitted | The programme lead when the lead step applies, else every `requests.approve` holder |
| Approved as lead | Every `requests.approve` holder |
| Waiting for a lead again (approval cleared, reset, claimant changed, re-charged, event moved) | That programme lead |
| Raised for someone | The claimant |
| Approved | The claimant, with the approver's note |
| Rejected (by finance or the lead) | The claimant, with the reason |
| Waiting 3+ days (daily) | Whoever it waits for: the programme lead (linked to the list's "Waiting for you"), else every `requests.approve` holder |
| Claimant changed | The new and the previous claimant |

Void notifies no one; reset, edits, claimant and Charged to changes notify only a lead the request now waits for. Every message reuses the `request_submitted`, `request_not_approved` and `requests_awaiting_approval` WhatsApp templates; vendor payments follow the same rules. Advance payments still send their own submitted, approved and rejected jobs.
