# Cash Vouchers

> **Load when**: cash voucher, voucher PDF, `generate-cash-voucher`, `@react-pdf/renderer`, `VOUCHER_ORG_*`, reimbursement line item voucher flow.
> **Related**: `jobs.md`, `pdf.md`, `file-uploads.md`

Generated for reimbursement line items ≤ ₹1000. Users opt in per line item. Auto-generate on reimbursement approval.

**Async job**: pg-boss `generate-cash-voucher` (payload: `{ lineItemId, voucherId }`).

Flow:

1. Receives reimbursement line item ID + voucher ID from enqueue call.
2. `packages/pdf/src/voucher.ts` builds PDF via `@react-pdf/renderer`.
3. PDF streamed → R2 upload via shared R2 client (`packages/jobs/src/handlers/r2.ts`).
4. On success, attachment record linked to voucher via transaction (`attachmentId` + `voucherId`).
5. Uses `singletonKey: voucherId` for dedup — safe to regenerate without duplication.
6. Atomic transaction: attachment linking succeeds only if upload succeeded.

**Config**: `VOUCHER_ORG_*` env vars — name, address, phone, email, registration. Logo/signature PNG assets at `packages/pdf/assets/`.
