# NGO Cash Voucher PDF Generation — Design

## Problem

Reimbursement line items ≤ ₹1000 often lack invoices (small cash expenses). NGOs need a formal cash voucher document as proof of payment for audit/compliance purposes.

## Scope

- **Reimbursements only** — vendor payments excluded.
- **Per line item** — each qualifying line item (≤ ₹1000) gets its own voucher PDF.
- **User opt-in** — checkbox per line item at submission time.
- **Auto-generate on approval** — opted-in items get vouchers when admin approves.
- **Admin generate/regenerate** — admin can generate vouchers for missed items or regenerate for corrections.

## Voucher PDF Layout

```
┌──────────────────────────────────────┐
│  [LOGO]  Organization Name           │
│          Address                     │
│          Phone | Email               │
│          Reg No: XXXXX               │
│                                      │
│          CASH VOUCHER                │
├──────────────────────────────────────┤
│  Voucher No: CV-2026-0042            │
│  Date: 08 Apr 2026                   │
│  City: Bangalore                     │
├──────────────────────────────────────┤
│  Paid To: John Doe                   │
├──────────────────────────────────────┤
│  Description    │ Category │ Amount  │
│  ───────────────┼──────────┼──────── │
│  Auto fare      │ Travel   │ ₹500    │
├──────────────────────────────────────┤
│  Amount in words: Rupees Five        │
│  Hundred Only                        │
├──────────────────────────────────────┤
│  Approved By: Admin Name             │
│  [Signature Image]                   │
└──────────────────────────────────────┘
```

**Fields:** Voucher number (sequential per year), date, city, paid-to name, line item (description + category + amount), amount in words, approved-by name + signature image.

**Assets:** Logo and signature are static images in `packages/pdf/assets/`. Org details (name, address, phone, email, reg no) come from environment variables.

## Architecture

### New Package: `packages/pdf`

Generic PDF generation workspace using `@react-pdf/renderer`. First template: cash voucher. Future templates can be added here.

```
packages/pdf/
  package.json
  tsconfig.json
  src/
    cash-voucher.tsx        — React PDF component
    generate-voucher.ts     — renderToBuffer wrapper
    amount-to-words.ts      — Indian rupee conversion
    amount-to-words.test.ts
  assets/
    logo.png
    signature.png
```

### Schema Changes

**`reimbursement_line_item` table** — two new columns:
- `generate_voucher` (boolean, default false) — user opt-in
- `voucher_attachment_id` (uuid FK → `reimbursement_attachment`, nullable) — links to generated voucher

**Postgres sequence** `voucher_seq` — monotonically increasing number for voucher IDs:
- `CREATE SEQUENCE voucher_seq`
- Job handler calls `SELECT nextval('voucher_seq')` for atomic allocation
- Numbers don't reset per year; formatted as `CV-{YYYY}-{NNNN}`

### Data Flow

```
User submits reimbursement
  → checks "Cash voucher" per line item (≤ 1000)
  → generateVoucher=true stored on line item

Admin approves reimbursement
  → approve mutator (server block)
  → filter line items: generateVoucher=true AND amount ≤ 1000
  → enqueue("generate-cash-voucher", { lineItemId, reimbursementId, approverUserId })

Job handler (generate-cash-voucher):
  1. Fetch line item + reimbursement + user + category + approver from DB
  2. Allocate voucher number (atomic INSERT/UPDATE on voucher_sequence)
  3. Render PDF via @react-pdf/renderer → Buffer
  4. Upload to R2: vouchers/{reimbursementId}/{uuidv7}-cash-voucher.pdf
  5. Insert reimbursement_attachment row
  6. Set line item's voucherAttachmentId → new attachment ID
  7. If regenerating: delete old R2 object + old attachment row first
```

### Admin Manual Generate

New `generateVoucher` mutator on the reimbursement module:
- Requires `requests.approve` permission
- Validates: reimbursement approved, line item amount ≤ 1000
- Enqueues the same `generate-cash-voucher` job

### Frontend Changes

**Form (line items editor):**
- Checkbox "Cash voucher" per line item, visible only when amount ≤ 1000

**Detail page (approved reimbursements):**
- Voucher column in line items table
- States: download link (has voucher), "Pending..." (opted in, not yet generated), "Generate" button (admin, no voucher), "Regenerate" button (admin, has voucher)

### Voucher Numbering

Format: `CV-{YYYY}-{NNNN}` (e.g., `CV-2026-0042`). Resets each fiscal year. Atomic allocation via the `voucher_sequence` table.

### Error Handling

- PDF generation/upload failures: pg-boss retries (3 attempts with backoff). Approval is never blocked.
- Amount threshold enforced at: form UI, mutator validation, job handler validation.
- Regeneration is idempotent: old attachment cleaned up before new one created.

### Environment Variables

```
VOUCHER_ORG_NAME
VOUCHER_ORG_ADDRESS
VOUCHER_ORG_PHONE
VOUCHER_ORG_EMAIL
VOUCHER_ORG_REGISTRATION
```
