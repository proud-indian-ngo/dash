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
| `pending` | Submitted, awaiting admin approval |
| `approved` | Admin approved, payments can be recorded |
| `rejected` | Admin rejected (terminal unless resubmitted) |
| `partially_paid` | Some transactions approved, total < line items |
| `paid` | All transactions approved, total >= line items |
| `invoice_pending` | Invoice uploaded, awaiting admin approval |
| `completed` | Invoice approved (terminal) |

## Phase 1 — Payment

1. Volunteer (or admin) creates VP: title, vendor, line items, quotation attachments. A payment has no programme of its own: the vendor payments table shows and filters by its event's programme ("No event" without one). A programme on the payment document itself waits for the posting layer in `finance-and-programmes.md`.
2. Admin approves/rejects VP.
3. Transactions recorded against VP. Creator is admin → auto-approved. Else → separate approval.
4. `recalculateParentStatus()` transitions VP: `approved` → `partially_paid` → `paid` based on approved transaction totals vs line item totals.

## Phase 2 — Invoice

5. Status `paid` → owner (or admin) uploads invoice: number, date, attachments with `purpose: "invoice"`.
6. Status → `invoice_pending`.
7. Admin approves → `completed`. Rejects → reverts to `paid` with `invoiceRejectionReason` set.
8. Owner can resubmit invoice on rejection (calls `submitInvoice` again).

## Attachment Purposes

`vendorPaymentAttachment.purpose`:
- `"quotation"` — uploaded at creation
- `"invoice"` — uploaded post-payment

Create/update mutators only touch `quotation`. Invoice mutators only touch `invoice`.

## Vendor Details

A vendor is a party with the `vendor` role; the synced `vendor` row holds only name, GSTIN and approval status. Contact details, PAN and the bank account live in the server-only `private` schema (`party_private`, `party_bank_account`, with PAN and account number AES-GCM encrypted) and never reach Zero. Vendor screens and the payment page's Vendor and Paid to cards load them through `getVendorDetails` in `apps/web/src/functions/vendors.ts`, with the account number masked to its last four digits. Create, edit and delete go through the audited `saveVendor` and `deleteVendor` server functions; approval stays on the Zero `vendor.approve`/`vendor.unapprove` mutators.

Revealing the full account number (`revealVendorBankAccount`, audited as `vendor.bank_account.reveal`) is allowed for `finance.view_sensitive` and `requests.approve` (approvers pay vendors), and for `requests.record_payment` holders who raised a payment request to that vendor themselves. Details are visible to `vendors.view_all`, `vendors.edit` and `requests.approve` (approvers review payments to pending vendors); for approved vendors also to `vendors.view_approved` and `requests.record_payment`; and to the creator of a pending vendor. Both rules live in `apps/web/src/lib/vendor-access.ts`; the server functions enforce them and the screens use them only to decide what to show. A refused details load shows "Not available to you" instead of a retry.

`vendor.created_by` is set to null when the creator's account is deleted (migration 0117), so the vendor and its payment history stay; approval notifications are then skipped.

Deleting a vendor whose party also holds another active role (for example a donor) removes only the `vendor` row, its `vendor` role and its bank accounts; the party and its private details stay for the other role. The Donors directory (`party.all`, `party.byId`) lists only parties with an active donor, sponsor, grantor or intermediary role, so vendor-only parties stay off it, and a donor save renames the matching `vendor` row so the two names cannot drift. Saves of one party ID serialise on `pg_advisory_xact_lock(hashtext(id))` before any row lock; the lock order for every vendor write path is documented at the top of `packages/db/src/queries/vendor-party.ts`.
