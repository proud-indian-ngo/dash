# Vendor payments

> **Load when**: vendor payment, VP, `vendorPayment`, status state machine, invoice approval, `recalculateParentStatus`, `quotation`/`invoice` attachment purposes, transaction recording, vendor details, bank-account reveal.
> **Related**: `authorization.md`, `data-layer.md`, `notifications.md`, `finance-books.md` (expense posting), `finance-bank-statements.md` (debit matching)

A vendor payment (VP) is approved twice: first the payment, then the invoice. The rule: no payment before approval, and the invoice comes only after payment.

## Statuses

```
pending → approved → partially_paid → paid → invoice_pending → completed
  │                      │               │          │
  └→ rejected            └→ paid ────────┘          └→ paid (rejection reverts)
```

| Status | Meaning |
|---|---|
| `pending` | Awaiting approval; no payments can be recorded |
| `approved` | Payments can be recorded |
| `rejected` | Terminal unless reset |
| `partially_paid` | Approved payments total less than the line items |
| `paid` | Approved payments cover the line items |
| `invoice_pending` | Invoice or no-invoice reason awaiting approval |
| `completed` | Invoice or no-invoice reason approved |

`recalculateParentStatus()` moves `approved` → `partially_paid` → `paid` from approved payment totals. It leaves `pending`, `rejected`, `invoice_pending` and `completed` alone.

## Payment phase

- The submitter enters title, vendor, line items, quotation attachments and what the payment is charged to (event, programme and optional project, or the organisation). Finance can change the charge at approval or later; see "Charged to" in `finance-and-programmes.md`.
- Approve and reject apply only to `pending` requests. Approval ends with `recalculateParentStatus()`, so a request already holding approved payments lands on `partially_paid` or `paid`; landing on `paid` sends `notify-vp-fully-paid`.
- Reject is refused once any payment is approved ("approve it instead"); otherwise it rejects the pending payments too.
- `requests.edit_all_statuses` holders can `resetToPending`, refused while the request has invoice data or any non-rejected payment.
- Payments are recorded only in `PAYABLE_STATUSES` (`approved`, `partially_paid`, `paid`, in `packages/zero/src/vendor-payment-constants.ts`). An admin's payment is auto-approved; others need approval, which the server refuses until the request is approved.

## Invoice phase

From `paid`, the owner or an admin opens **Add invoice or reason** and picks a kind:

- **Invoice**: number, date and at least one attachment.
- **No invoice** (rent, tax and similar): reason `rent`, `statutory` or `other`, a required document date (defaults to the latest approved payment's date) and optional proof. The note (max 500 characters) is required for `other`. `noInvoiceDetailsError` enforces this in form and mutators; values and labels are in `@pi-dash/shared/constants` and `@pi-dash/shared/vendor-payment`.

Rules:

- `submitInvoice` and `updateInvoice` take a union on `kind`. A missing `kind` is treated as `"invoice"` for older clients; remove that shim after the next release.
- The document date for both kinds is `invoice_date`. The form stores the calendar day as UTC midnight and converts it back for display, so the day never shifts. A request falls in the financial year of `invoice_date`, which the export also prints.
- Each kind clears the other's columns; the `vendor_payment_invoice_or_no_invoice_chk` check forbids an invoice number with a no-invoice reason.
- Submission moves the request to `invoice_pending`. Approval moves it to `completed`; rejection reverts to `paid` with `invoiceRejectionReason`, and the owner resubmits with `submitInvoice`.
- An admin edits an existing submission with **Edit details** (`updateInvoice`). Editing within the same kind keeps a completed request completed. Changing kind sends it back to `invoice_pending`, clears the review and notifies approvers.
- Switching kind or editing replaces the `invoice` attachments with the submitted set; removed files are deleted.
- The detail page shows "No invoice — <reason>" with date, note and proof, or "No proof attached".

## Attachments

`vendorPaymentAttachment.purpose` is `quotation` (at creation) or `invoice` (after payment: the invoice or no-invoice proof). Create and update mutators touch only quotations; invoice mutators touch only invoices.

## Charging a line to a provision (audit fee)

The auditor is paid the year after the CA provides for the fee (`Audit fees payable`). When approving the invoice, finance can open "Charge to a provision" and, per line, pick "Audit fees payable (provision)" instead of the category's expense. The picker shows what is outstanding for this invoice today.

- `vendorPayment.approveInvoice` takes `provisionHeadId` and `provisionLineIds`, needs `requests.approve`, and accepts only heads in `PROVISION_HEADS` (`@pi-dash/shared/provisions`). The choice is stored in `vendor_payment_line_item.provision_head_id`.
- An edit keeps the choice, even when the amount changes, because a completed invoice cannot be approved again. Changing the line's category or removing the line clears it, with a "Provision charge cleared" history entry.
- The books clear the provision by what is outstanding on the invoice's day and post the rest under `Audit fees`. The Invoice section shows each line's split once posted. Allocation across invoices: "Audit fee provision" in `finance-books.md`.

## Voiding

Once the books hold a request or payment, it is voided, not deleted ("Posted to the books. Void it instead."). See "Voiding" in `finance-books.md`.

- `vendorPayment.void` (`requests.void`, with a reason) sets `voided_at`, `voided_by` and `void_reason` on the request and its payments, keeps status, attachments and history, and queues a posting run that reverses the invoice expense and each payment on the void day.
- `vendorPaymentTransaction.void` voids one payment. It stops counting as paid, so the request may drop to `partially_paid` and an accepted invoice waits in the books until payments cover it again.
- A voided request takes no further action. The list hides voided requests until "Show voided" is pressed.

## Vendor details

A vendor is a party with the `vendor` role. The synced `vendor` row holds only name, GSTIN and approval status. Contact details, PAN and bank account are in the server-only `private` schema (`party_private`, `party_bank_account`; PAN and account number AES-GCM encrypted) and never reach Zero.

- Screens load them through `getVendorDetails` (`apps/web/src/functions/vendors.ts`), with the account number masked to its last four digits. Create, edit and delete go through the audited `saveVendor` and `deleteVendor`; approval stays on the Zero `vendor.approve`/`vendor.unapprove` mutators.
- Access rules live in `apps/web/src/lib/vendor-access.ts`; the server enforces them.
  - Details: `vendors.view_all`, `vendors.edit`, `requests.approve`; for approved vendors also `vendors.view_approved` and `requests.record_payment`; and the creator of a pending vendor.
  - Full account number (`revealVendorBankAccount`, audited as `vendor.bank_account.reveal`): `finance.view_sensitive`, `requests.approve`, and `requests.record_payment` holders who raised a payment to that vendor.
- `vendor.created_by` becomes null when the creator's account is deleted; approval notifications are then skipped.
- Deleting a vendor whose party has another active role (such as donor) removes only the `vendor` row, role and bank accounts. The Donors directory lists only donor, sponsor, grantor or intermediary parties, and a donor save renames the matching `vendor` row.
- Saves of one party serialise on `pg_advisory_xact_lock(hashtext(id))` before any row lock. The lock order for vendor writes is at the top of `packages/db/src/queries/vendor-party.ts`.
