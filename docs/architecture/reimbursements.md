# Reimbursements

> **Load when**: reimbursement lifecycle, approve, reject, reset to pending, void, edit after approval, `requests.*` permissions, line items, expense categories, expense date, saved bank accounts, UPI payout, Paid to card, claim for others, change claimant, advance payments, financial-year export.
> **Related**: `finance-and-programmes.md` (Charged to), `cash-vouchers.md`, `finance-books.md`, `finance-bank-statements.md`, `file-uploads.md`, `notifications.md`, `audit-log.md`, `authorization.md`

A reimbursement repays someone who spent their own money on Proud Indian's work. Finance pays the claimant first, by bank transfer or UPI, and then approves the request with the payment screenshot. Approval therefore means "paid": there is no separate paid status.

## Statuses and transitions

`reimbursement.status` is `pending`, `approved` or `rejected` (`packages/db/src/schema/reimbursement.ts`). Voiding is a separate flag (`voided_at`, `voided_by`, `void_reason`) beside the unchanged status.

| Action | From | To | Who | Rules |
|---|---|---|---|---|
| Submit (`create`) | | `pending` | `requests.create` | Expense date not in the future; at least one line item (form) |
| Edit (`update`) | `pending` | same | Owner with `requests.edit_own`, or `requests.edit_all` | |
| Edit (`update`) | any | same | `requests.edit_all_statuses` | See "Edits after approval" |
| Approve | `pending` | `approved` | `requests.approve` | Needs a payment screenshot, new or already stored |
| Reject | `pending` | `rejected` | `requests.approve` | Needs a reason, stored in `rejection_reason` |
| Approve or reject from another status | `rejected` / `approved` | the other | `requests.approve` and `requests.edit_all_statuses` | Reject refused while a bank debit is matched |
| Reset to pending | `approved` / `rejected` | `pending` | `requests.edit_all_statuses` | Refused while a bank debit is matched; the screenshot is kept as an attachment |
| Void | any | flag set | `requests.void` | Needs a reason; refused while a bank debit is matched |
| Delete | `pending` (owner) or any (`requests.delete_all`) | gone | Owner, or `requests.delete_all` | Refused once posted, voided or matched |
| Change claimant | any | same | `requests.create_for_others` | Needs a reason |
| Change Charged to | `pending` / `approved` | same | `finance.manage`, or `requests.approve` with `requests.view_all` | Never your own request; refused once posted |

- Mutators live in `packages/zero/src/mutators/reimbursement.ts`. Every one refuses a voided request; voiding twice changes nothing.
- Each transition writes a `reimbursement_history` row and queues posting. The books then post, repost or reverse it; see "Expense posting rules" in [finance-books.md](finance-books.md).
- Role defaults (`packages/db/src/permissions.ts`): volunteers can create, view, edit and delete their own requests. `admin` and `finance_admin` can view, edit and delete everyone's. Only `finance_admin` and `super_admin` can approve, void and claim for others. `requests.edit_all_statuses` is left out of both admin roles, so by default only `super_admin` holds it.
- The `delete` mutator lets the owner delete a pending request without checking `requests.delete_own`.
- The detail page offers **Void** only once the request is in the books. An unposted request is deleted instead. Voiding is covered under "Voiding" in [finance-books.md](finance-books.md).
- Matched bank debits block un-approving. Unmatch the line first; see [finance-bank-statements.md](finance-bank-statements.md).

### Edits after approval

`requests.edit_all_statuses` lets a holder edit an approved or rejected request through the normal form (`canEditRequestSubmission` in `apps/web/src/lib/request-edit-permissions.ts`).

- Editing an approved request queues vouchers for opted-in items that are new, changed or still lack one, as approval would.
- An edit after posting reverses and reposts the request.
- Kept payment proof (`payment-proof-replaced-*`, `payment-proof-previous-*`) can be removed only by a `requests.approve` holder.
- Payee signatures survive an edit that drops their file. An item changed after signing loses its signature, and history notes it. See [cash-vouchers.md](cash-vouchers.md).

Adding or replacing the payment screenshot on an approved request is a separate action, `addPaymentProof`. See "Payment proof after approval" in [finance-books.md](finance-books.md).

## Line items, categories and the expense date

- A request has one `expense_date` for all its lines, stored as a date. The form and the mutator both refuse a future date.
- Each `reimbursement_line_item` has an amount in paise (`bigint`), an expense category, an optional description and a sort order. A line can opt into a cash voucher with a payee; see [cash-vouchers.md](cash-vouchers.md).
- Attachments (receipts, files or URLs) belong to the request, not to a line. Uploads go through `getRequestUploadUrl` (`apps/web/src/functions/attachments.ts`); see [file-uploads.md](file-uploads.md).
- The request also records a `city` (Bangalore or Mumbai), which the form requires.
- Expense categories (`expense_category`) are managed in Settings → Expense categories with `settings.expense_categories`. Each category posts under its own `EXPENSE_<NAME>` account head; see "Account heads" in [finance-and-programmes.md](finance-and-programmes.md). A category used by any line item can't be deleted, because the foreign key restricts it.

## Payouts: bank accounts and UPI

People save where they want to be paid in Settings → Bank accounts (`bank_account`). An entry holds bank details, a UPI handle, or both.

- `account_number` and `ifsc_code` are set together or not at all. A database check requires bank details, UPI or both.
- `upi_id` is a UPI ID or the mobile number linked to UPI. The rules live in `packages/shared/src/payout-account.ts` and are used by both the form and `bankAccount.create`:
  - UPI IDs are lower-cased.
  - Mobiles lose `+91`, a leading `0`, spaces and dashes, and must be 10 digits starting 6 to 9. Custom 8 or 9 digit UPI numbers are refused because they look like account numbers.
- Account numbers and UPI handles are each unique per person. The first entry becomes the default, and deleting the default promotes the oldest remaining one. Entries can't be edited; delete and add again.
- `bankAccount.create`, `delete` and `setDefault` check only that you are signed in and own the entry. `bank_accounts.manage_own` is granted to volunteers but enforced nowhere.

### What a request stores

A request copies the chosen entry into `bank_account_name`, `bank_account_number`, `bank_account_ifsc_code` and `bank_account_upi_id`. Later changes to the saved entry don't touch existing requests.

- On your own request the form copies the fields. Picking another entry sends every part, and a part the new entry lacks is sent as `""` and cleared. The mutator checks only the UPI format.
- For someone else, the client sends the entry's ID, and the server copies its details (`claimantBankFields` in `packages/zero/src/mutators/claimant.ts`). The server refuses an entry that isn't the claimant's.

### How finance pays

The detail page's **Paid to** card shows the bank details and UPI with a **Pay by** line: "Bank transfer", "UPI" or "Bank transfer or UPI". Finance pays outside the dashboard by whichever suits them, then approves with the screenshot. Payment screenshots are covered in [file-uploads.md](file-uploads.md).

### Storage, reveal and audit

- Payout details are plain text and sync through Zero. The request's copy syncs to anyone who can see the request: the claimant, and `requests.view_all` holders.
- Saved entries sync to their owner. `bankAccount.bankAccountsForClaimant` also lets `requests.create_for_others` holders read another person's entries.
- Nothing is encrypted and there is no reveal step, unlike vendor bank accounts. Encrypting payee account numbers on requests is planned under "Data protection" in [finance-and-programmes.md](finance-and-programmes.md).
- Every mutation is audited through the Zero boundary. Metadata records only changed field names such as `bankAccountUpiId` or `upiId`, never values; see [audit-log.md](audit-log.md).

## Claim for others

- `requests.create_for_others` shows a "Claim for" picker on new reimbursements.
  - `created_by` records who raised the request. `user_id` is the claimant, who sees it, is notified and is paid into one of their saved bank accounts or UPI.
  - The claimant must be an active member who is not an external user. A claimant with nothing saved can't be claimed for.
  - History notes "Raised by X for Y".
- `reimbursement.changeClaimant` moves a request to another claimant at any status, with a reason.
  - `previousUserId` must match the current claimant, so two changes can't race.
  - The payout details become one of the new claimant's saved entries. If they have none, the details are cleared; if they have any, one must be chosen.
  - Vouchers print the claimant, so every voucher and signed copy is unlinked; the files stay among the attachments. An approved request queues fresh vouchers.
  - A posted request is reversed and reposted, because the payout memo names the claimant.
  - History records both user IDs in its metadata.

## Charged to

Every reimbursement records the event, programme (with optional project) or organisation it served. See "Expense Charged to" in [finance-and-programmes.md](finance-and-programmes.md).

## Advance payments

Advance payments are discontinued. Existing records stay as history and never post to the books.

- The table and mutators remain (`packages/zero/src/mutators/advance-payment.ts`): `create`, `update`, `approve`, `reject`, `resetToPending` and `delete`, with the same permissions as reimbursements. Nothing in the UI calls `create`, because `/reimbursements/new` always makes a reimbursement.
- Existing advances still appear in the reimbursements list (Type filter) and open at `/reimbursements/$id`, where they can be edited, approved or rejected. They have no Charged to, void, claimant change or payee signature.
- Approving an advance also needs a screenshot. A replaced or reset screenshot is deleted rather than kept.

## Financial-year export

`/export` (`apps/web/src/routes/_app/export.tsx`) downloads a ZIP from `GET /api/financial-export` (`apps/web/src/routes/api/financial-export.ts`, data in `apps/web/src/lib/server/financial-export.ts`).

- It covers one April to March year, chosen from the last four.
- It holds a CSV of reimbursements and advance payments (filterable by status), an optional vendor payments CSV and an optional vendor payment transactions CSV, plus the reimbursement and advance attachment files. Vendor payment files are not included.
- Reimbursements are picked by expense date, advances by submission date and vendor payments by invoice date.
- Programme, Project and Charged to come from `expenseProgrammeOf`. The CSVs carry no payout details.
- Both the page and the API need `requests.export`, which is reserved for `super_admin` (see [authorization.md](authorization.md)).
- The export is not audited: it is a GET route outside `runSessionAuditedAction`.
- Gotchas: voided requests are included with their unchanged status and no void column. "Created By" is the claimant's name, not `created_by`.

## Notifications

Jobs are enqueued after commit from the mutators; delivery is described in [notifications.md](notifications.md). Senders live in `packages/notifications/src/send/reimbursement.ts`.

| Event | Job | Reaches |
|---|---|---|
| Submitted | `notify-reimbursement-submitted` | Every `requests.approve` holder (topic `REQUESTS_SUBMISSIONS`) |
| Raised for someone | `notify-reimbursement-raised-for-you` | The claimant |
| Approved | `notify-reimbursement-approved` | The claimant, with the approver's note |
| Rejected | `notify-reimbursement-rejected` | The claimant, with the reason |
| Claimant changed | `notify-reimbursement-claimant-changed` | The new and the previous claimant |

Reset, void, edits and Charged to changes notify no one. Advance payments still send their own submitted, approved and rejected jobs.

## Code map

| Piece | Where |
|---|---|
| List, new, detail routes | `apps/web/src/routes/_app/reimbursements/` (`index.tsx`, `new.tsx`, `$id.tsx`; `route.tsx` needs `requests.view_own` or `requests.view_all`) |
| Form, detail, table, filters | `apps/web/src/components/reimbursements/` (`reimbursement-form.tsx`, `reimbursement-detail.tsx`, `reimbursements-table.tsx`, `reimbursement-filters.ts`) |
| Claimant picker and change dialog | `claim-for-field.tsx`, `claimant-picker.tsx`, `change-claimant-dialog.tsx` in the same folder |
| Saved accounts | `apps/web/src/routes/_app/settings/bank-accounts.tsx`, `apps/web/src/components/settings/sections/banking-section.tsx` |
| Mutators | `packages/zero/src/mutators/` `reimbursement.ts`, `claimant.ts`, `bank-account.ts`, `advance-payment.ts`, `expense-charge.ts`, `void.ts`, `voucher-fields.ts` |
| Queries | `packages/zero/src/queries/reimbursement.ts`, `bank-account.ts` |
| Shared rules | `packages/shared/src/payout-account.ts`, `packages/shared/src/expense-charge.ts` |
| Upload URL | `getRequestUploadUrl` in `apps/web/src/functions/attachments.ts` |
| Export | `apps/web/src/routes/_app/export.tsx`, `apps/web/src/routes/api/financial-export.ts` |
