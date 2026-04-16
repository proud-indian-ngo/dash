# PDF Generation (`packages/pdf`)

> **Load when**: `@react-pdf/renderer`, voucher layout, `amount-to-words`, PDF assets (logo/signature).
> **Related**: `cash-vouchers.md`, `jobs.md`

React PDF (`@react-pdf/renderer`) for cash voucher generation.

| File | Purpose |
|---|---|
| `src/cash-voucher.tsx` | Voucher layout — org details, line items, amounts, signatures |
| `src/amount-to-words.ts` | Numeric amount → English words for vouchers |
| `assets/logo.png`, `assets/signature.png` | Static assets embedded in PDF |

Voucher flow: `generate-cash-voucher` job → queries reimbursement + line items → renders PDF → uploads to R2 → attaches to reimbursement record. Env vars `VOUCHER_ORG_*` configure org details on the voucher.
