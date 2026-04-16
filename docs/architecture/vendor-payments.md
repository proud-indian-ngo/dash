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

1. Volunteer (or admin) creates VP: title, vendor, line items, quotation attachments.
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
