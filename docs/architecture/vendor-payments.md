# Vendor payments

> **Load when**: vendor payment, VP, `vendorPayment`, lead approval, status state machine, invoice or no-invoice approval, payment recording, vendor details, bank-account reveal.
> **Related**: `authorization.md`, `finance-books.md` (expense posting), `finance-bank-statements.md` (debit matching)

A vendor payment (VP) is approved twice: first the payment, then the invoice. The rule: no payment before approval, and the invoice comes only after payment.

## Statuses

```
pending → approved → partially_paid → paid → invoice_pending → completed
  │                      │               │          │
  └→ rejected            └→ paid ────────┘          └→ paid (rejection reverts)
```

- Payments can be recorded only in `approved`, `partially_paid` and `paid`.
- `partially_paid` and `paid` compare approved payment totals with the line items. `recalculateParentStatus()` moves `approved` → `partially_paid` → `paid` and leaves every other status alone.
- `invoice_pending` waits for approval of an invoice or a no-invoice reason; approval gives `completed`.
- Server mutations lock the parent before reading status, lines or payment totals, through their writes and status recalculation. Payment edits re-read the transaction after locking its parent. This serializes creates, reviews, edits, deletes, voids and invoice changes across clients; bank-match checks precede payment-row writes.

## Payment phase

- The lead of the programme it is charged to approves it first, or rejects it; finance may approve without them, with a reason. See "Approval policy" in `finance-and-programmes.md`. The lead step covers only this approval, not payments or the invoice.
- Finance can change what the request is charged to at approval or later; see "Charged to" in `finance-and-programmes.md`.
- Approvers are warned when the vendor is a trustee or a party a trustee declared ([declarations](governance-compliance.md#declarations-of-interests)).
- Approve and reject apply only to `pending` requests. Approval ends with `recalculateParentStatus()`, so a request already holding approved payments lands on `partially_paid` or `paid`.
- Reject is refused once any payment is approved; otherwise it rejects the pending payments too.
- `requests.edit_all_statuses` holders can `resetToPending`, refused while the request has invoice data or any non-rejected payment. It clears the lead's approval.
- Request details are editable while pending by the owner with `requests.edit_own`, or by a `requests.edit_all` holder. Only `requests.edit_all_statuses` can edit request details after pending.
- An admin's payment is auto-approved, except on their own request; others need approval, which the server refuses until the request is approved. Nobody approves the request or a payment on it when they raised it.
- Only whoever recorded a payment edits or deletes it (delete also needs `requests.delete_own`), while it is pending and the invoice is not locked. The request's owner cannot change a payment someone else recorded. `requests.edit_all` can edit any recorder's pending payment; `requests.delete_all` can delete one until it is posted. Reviewed payments are immutable here; void and rerecord one that has reached the books.

## Invoice phase

From `paid`, the owner or an admin submits either an invoice or a no-invoice reason (rent, statutory payments and similar). `noInvoiceDetailsError` enforces the no-invoice rules in form and mutators.

Rules:

- `submitInvoice` and `updateInvoice` take a union on `kind`. A missing `kind` is treated as `"invoice"` for older clients; remove that shim after the next release.
- The document date for both kinds is `invoice_date`. The form stores the calendar day as UTC midnight and converts it back for display, so the day never shifts. A request falls in the financial year of `invoice_date`, which the export also prints.
- Each kind clears the other's columns; a check constraint forbids an invoice number with a no-invoice reason.
- Rejection reverts to `paid` with a reason, and the owner resubmits.
- Editing within the same kind keeps a completed request completed. Changing kind sends it back to `invoice_pending`, clears the review and notifies approvers.
- Switching kind or editing replaces the `invoice` attachments with the submitted set; removed files are deleted.

## Attachments

`vendorPaymentAttachment.purpose` is `quotation` (at creation) or `invoice` (after payment: the invoice or no-invoice proof). Create and update mutators touch only quotations; invoice mutators touch only invoices.

## Charging a line to a provision (audit fee)

The auditor is paid the year after the CA provides for the fee (`Audit fees payable`). When approving the invoice, finance can charge a line to the provision instead of the category's expense.

- `vendorPayment.approveInvoice` accepts only heads in `PROVISION_HEADS` (`@pi-dash/shared/provisions`). The choice is stored on the line item.
- An edit keeps the choice, even when the amount changes, because a completed invoice cannot be approved again. Changing the line's category or removing the line clears it, with a history entry.
- The books clear the provision by what is outstanding on the invoice's day and post the rest under `Audit fees`. Allocation across invoices: "Audit fee provision" in `finance-books.md`.

## Voiding

Once the books hold a request or payment, it is voided, not deleted. See "Voiding" in `finance-books.md`.

- `vendorPayment.void` (`requests.void`, with a reason) flags the request and its payments, keeps status, attachments and history, and queues a posting run that reverses the invoice expense and each payment on the void day.
- `vendorPaymentTransaction.void` voids one payment. It stops counting as paid, so the request may drop to `partially_paid` and an accepted invoice waits in the books until payments cover it again.
- A voided request takes no further action.

## Vendor details

A vendor is a party with the `vendor` role. The synced `vendor` row holds only name, GSTIN and approval status. Contact details, PAN and bank account are in the server-only `private` schema (PAN and account number AES-GCM encrypted) and never reach Zero.

- Screens load them through `getVendorDetails` (`apps/web/src/functions/vendors.ts`), with the account number masked. Create, edit and delete go through audited server functions; approval stays on Zero mutators.
- Access rules live in `apps/web/src/lib/vendor-access.ts`; the server enforces them.
  - Details: `vendors.view_all`, `vendors.edit`, `requests.approve`; for approved vendors also `vendors.view_approved` and `requests.record_payment`; and the creator of a pending vendor.
  - Full account number (audited reveal): `finance.view_sensitive`, `requests.approve`, and `requests.record_payment` holders who raised a payment to that vendor.
- `vendor.created_by` becomes null when the creator's account is deleted; approval notifications are then skipped.
- Deleting a vendor whose party has another active role (such as donor) removes only the `vendor` row, role and bank accounts. A donor save renames the matching `vendor` row.
- Saves of one party serialise on `pg_advisory_xact_lock(hashtext(id))` before any row lock. The lock order for vendor writes is at the top of `packages/db/src/queries/vendor-party.ts`.
