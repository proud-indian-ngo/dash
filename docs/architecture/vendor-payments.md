# Vendor Payment Lifecycle

> **Load when**: vendor payment, VP, `vendorPayment`, status state machine, invoice approval, `recalculateParentStatus`, `quotation`/`invoice` attachment purposes, transaction recording.
> **Related**: `authorization.md`, `data-layer.md`, `notifications.md`

Two-phase approval: payment approval → invoice approval.

## Status State Machine

```
pending → approved → partially_paid → paid → invoice_pending → completed
  │                      │               │          │
  └→ rejected            └→ paid ────────┘          └→ paid (rejection reverts)
```

| Status | Meaning |
|---|---|
| `pending` | Submitted, awaiting admin approval; no payments can be recorded |
| `approved` | Admin approved, payments can be recorded |
| `rejected` | Admin rejected (terminal unless resubmitted) |
| `partially_paid` | Some transactions approved, total < line items |
| `paid` | All transactions approved, total >= line items |
| `invoice_pending` | Invoice uploaded (or no-invoice reason given), awaiting admin approval |
| `completed` | Invoice or no-invoice submission approved (terminal) |

## Phase 1 — Payment

1. Volunteer (or admin) creates VP: title, vendor, line items, quotation attachments. The submitter says what the payment is charged to: an event, a programme (and optional project) without an event, or the organisation (admin); finance can change it at approval or later. The vendor payments table shows and filters by the derived programme ("Admin" for organisation). See "Charged to" in `finance-and-programmes.md`.
2. Admin approves/rejects VP. Approve and reject apply only to `pending` requests, for every role; `requests.edit_all_statuses` holders reopen review with `resetToPending`, which is refused while the request has invoice data or any payment that is not rejected; rejected payments do not block it and stay on the request as history. Approve ends with `recalculateParentStatus()`, so an older pending request that already holds approved payments lands on `partially_paid` or `paid`; landing on `paid` also sends the owner the fully-paid notification (`notify-vp-fully-paid`), as approving the final payment does. Reject is refused while the request has an approved payment ("This request already has approved payments; approve it instead"), since the money already went out; otherwise it cascades to the request's pending transactions.
3. Transactions recorded against VP once it is `approved`, `partially_paid` or `paid` (`PAYABLE_STATUSES` in `packages/zero/src/vendor-payment-constants.ts`); a pending request refuses them ("Payments can be recorded only after the vendor payment is approved") and the detail page says so in place of the Record payment button. While the request is pending, its payment rows have no Approve or Reject actions; the server refuses those until the request is approved. Creator is admin → auto-approved. Else → separate approval.
4. `recalculateParentStatus()` transitions VP: `approved` → `partially_paid` → `paid` based on approved transaction totals vs line item totals. It leaves `pending`, `rejected`, `invoice_pending` and `completed` alone.

## Phase 2 — Invoice

5. Status `paid` → owner (or admin) opens **Add invoice or reason** and answers **Do you have an invoice?** with one of two kinds:
   - **Yes, upload invoice**: invoice number, invoice date and at least one attachment with `purpose: "invoice"`.
   - **No invoice** (rent, tax and the like): a reason, `rent` ("Rent / lease"), `statutory` ("Tax / statutory payment") or `other` ("Other"); a required document date; and an optional proof attachment with `purpose: "invoice"`. The date label is "Receipt or challan date", or "Date" for Other. The form defaults it to the latest approved payment's `transactionDate`. The reason and note are stored in the nullable `vendor_payment.no_invoice_reason` (enum `vendor_payment_no_invoice_reason`) and `no_invoice_note` columns (migration 0130). The document date for both kinds is stored in `invoice_date`. The form encodes its calendar day as UTC midnight for Zero and converts it back to a local calendar date for display and editing, so saving does not shift the day. The values are `vendorPaymentNoInvoiceReasonValues` in `@pi-dash/shared/constants`, and the labels and proof rule are in `@pi-dash/shared/vendor-payment`. The note is limited to 500 characters. It is optional for rent and statutory payments and required for Other; `noInvoiceDetailsError` enforces this in the form and mutators. When there is no proof, the detail page shows "No proof attached" so the approver sees it before approving.
6. `submitInvoice` and `updateInvoice` take a discriminated union on `kind` (`"invoice"` | `"no_invoice"`). For compatibility with clients from the previous release, a missing `kind` is temporarily preprocessed as `"invoice"`; remove this shim after the next release. Each kind clears the other kind's exclusive columns. The `vendor_payment_invoice_or_no_invoice_chk` database check forbids an invoice number together with a no-invoice reason, while `invoice_date` is valid for and required by the mutators for both kinds. A submission moves the request to `invoice_pending`. The history entry stays `invoice_submitted` / `invoice_updated`, with `metadata.invoiceKind` (and `noInvoiceReason`) and, for no invoice, a note naming the reason.
7. Admin approval moves the request to `completed`; rejection reverts it to `paid` with `invoiceRejectionReason` set. For no-invoice submissions, the actions are **Approve without invoice** and **Reject reason**, with the matching "Closed without invoice" and "Reason rejected" confirmations. Invoice wording is unchanged. The submission notification names the no-invoice reason and says either "No proof attached" or "with N proof file(s)".
8. Owner can resubmit either kind on rejection by calling `submitInvoice` again. An admin uses **Edit details** for an existing submission. The action opening the dialog determines its mode: initial submission and resubmission call `submitInvoice`, while editing calls `updateInvoice`, regardless of edit permission. Editing a completed request within the same kind keeps it `completed` and preserves its review. Changing kind moves it back to `invoice_pending`, clears `invoiceReviewedAt` and `invoiceReviewedBy`, and notifies approvers so the replacement needs approval. `invoice_updated` history metadata records `invoiceKind`, `oldInvoiceKind` and `newInvoiceKind` for the change.

Switching kind replaces the request's `invoice` attachments with the ones submitted: the form opens with the current files, so files the user keeps stay on the request and files they remove are deleted, as in any invoice edit.

The detail page shows "No invoice — <reason>" with the document date, note and files under "Proof". The financial-year export puts that text in the Invoice Number column and the stored `invoice_date` in the Invoice Date column. Both kinds fall in the financial year of `invoice_date`; there is no latest-approved-payment fallback.

## Status repair

Before payments needed an approved request, a request could be paid while still `pending`, and an admin approval from any status reset a paid or invoiced request to `approved`. `bun run vendor-payments:repair-status` (`scripts/repair-vendor-payment-status.ts`, rules in `packages/zero/src/lib/vendor-payment-status-repair.ts`) lists the requests whose status disagrees with their data and is a dry run by default; `--apply --actor <email>` corrects them and writes an `updated` history entry by that user. That history entry is the only trace of a script change: scripts do not write `audit_log`, by design. The script warns when the actor lacks `requests.edit_all_statuses`.

- `approved`, `partially_paid` or `paid` → the status the approved payments give, or `invoice_pending` / `completed` when an unrejected invoice is on file. A no-invoice reason counts as an invoice on file. A rejected invoice stays at `paid`.
- `completed` only when the invoice approval is current. A kind-changing `updateInvoice` clears `invoiceReviewedAt` and moves the request to `invoice_pending`; a same-kind edit keeps both the completed status and review fields. For legacy data, the planner compares `invoiceReviewedAt` with the latest `invoice_submitted` or `invoice_updated` history entry; `updatedAt` is not used because every payment and status change moves it. A review earlier than that entry, or invoice details with no such entry, is listed for review by hand.
- `pending` with approved payments is only listed; approve it in the app.
- `rejected` with approved payments is listed for review by hand and never changed.
- An unrejected invoice on a request whose payments no longer cover the line items is listed for review by hand.

The output ends with the requests moved (or, in a dry run, that would move) to `paid`, so finance can chase their invoices; the script sends no notifications.

## Attachment Purposes

`vendorPaymentAttachment.purpose`:
- `"quotation"` — uploaded at creation
- `"invoice"` — uploaded post-payment: the vendor invoice, or the proof for a payment without one

Create/update mutators only touch `quotation`. Invoice mutators only touch `invoice`.

## Vendor Details

A vendor is a party with the `vendor` role; the synced `vendor` row holds only name, GSTIN and approval status. Contact details, PAN and the bank account live in the server-only `private` schema (`party_private`, `party_bank_account`, with PAN and account number AES-GCM encrypted) and never reach Zero. Vendor screens and the payment page's Vendor and Paid to cards load them through `getVendorDetails` in `apps/web/src/functions/vendors.ts`, with the account number masked to its last four digits. Create, edit and delete go through the audited `saveVendor` and `deleteVendor` server functions; approval stays on the Zero `vendor.approve`/`vendor.unapprove` mutators.

Revealing the full account number (`revealVendorBankAccount`, audited as `vendor.bank_account.reveal`) is allowed for `finance.view_sensitive` and `requests.approve` (approvers pay vendors), and for `requests.record_payment` holders who raised a payment request to that vendor themselves. Details are visible to `vendors.view_all`, `vendors.edit` and `requests.approve` (approvers review payments to pending vendors); for approved vendors also to `vendors.view_approved` and `requests.record_payment`; and to the creator of a pending vendor. Both rules live in `apps/web/src/lib/vendor-access.ts`; the server functions enforce them and the screens use them only to decide what to show. A refused details load shows "Not available to you" instead of a retry.

`vendor.created_by` is set to null when the creator's account is deleted (migration 0117), so the vendor and its payment history stay; approval notifications are then skipped.

Deleting a vendor whose party also holds another active role (for example a donor) removes only the `vendor` row, its `vendor` role and its bank accounts; the party and its private details stay for the other role. The Donors directory (`party.all`, `party.byId`) lists only parties with an active donor, sponsor, grantor or intermediary role, so vendor-only parties stay off it, and a donor save renames the matching `vendor` row so the two names cannot drift. Saves of one party ID serialise on `pg_advisory_xact_lock(hashtext(id))` before any row lock; the lock order for every vendor write path is documented at the top of `packages/db/src/queries/vendor-party.ts`.
