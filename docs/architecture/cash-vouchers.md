# Cash Vouchers

> **Load when**: cash voucher, voucher PDF, `generate-cash-voucher`, `@react-pdf/renderer`, `VOUCHER_ORG_*`, reimbursement line item voucher flow, cash-voucher limit.
> **Related**: `jobs.md`, `pdf.md`, `file-uploads.md`

A cash voucher stands in for a bill on a reimbursement line item paid in cash with no invoice possible, for example a daily-wage labourer paid ₹2,000 for a one-time job. Users opt in per line item; vouchers auto-generate on approval, and an approver can generate or regenerate one from the request.

## Limit

Line items up to the **cash-voucher limit** qualify. Finance sets it in Settings → Programmes → Cash vouchers (`finance.manage`, or `settings.app_config`). It is stored in `app_config` under `cash_voucher_limit_paise` as whole paise; the default is ₹1,000 and the allowed range ₹1 to ₹10,000. ₹10,000 is a hard cap: cash paid to one person in a day above it doesn't count as spending on the trust's objects. `packages/shared/src/cash-voucher.ts` holds the key, default, cap, `parseCashVoucherLimit` (falls back to the default for a missing or invalid row, so a bad value can never lift the limit past the cap) and `qualifiesForCashVoucher(amountPaise, limitPaise)`.

How the limit reaches each side:

- **Writes**: `appConfig.upsert` lets `finance.manage` write the key and refuses any value outside ₹1 to ₹10,000 (`assertValidAppConfigValue`). The change is audited through the Zero mutation boundary like other `app_config` writes.
- **Zero mutators** (`packages/zero/src/mutators/reimbursement.ts`): `readCashVoucherLimit(tx)` reads the `app_config` row. On the server that is the database, so the server decides; on the client it is the synced row (`app_config` syncs to every non-external user), with the default until it arrives. `generateVoucher` refuses an item over the limit ("Vouchers can only be generated for items ≤ ₹2,000"); `approve` queues vouchers only for opted-in items within it; `create` and `update` keep an opt-in only for items within it and silently drop it otherwise (a box ticked before the amount grew).
- **Job**: `generate-cash-voucher` reads the row again and skips an item over the limit (`amount_exceeds_threshold`).
- **UI**: `useCashVoucherLimit()` (`apps/web/src/hooks/use-cash-voucher-limit.ts`) drives the line-items editor's checkbox and tooltip and the request detail's Voucher column.

Lowering the limit never touches vouchers already generated: they stay linked and downloadable. It applies to new generation requests and new submissions; the detail page hides Regenerate and shows "Over the ₹… voucher limit" for an opted-in item that no longer qualifies.

## Payee acknowledgement

A ticked line item shows an optional **Payee's mobile** (`reimbursement_line_item.payee_phone`, E.164; migration `0142_voucher_payee_phone`). It must be an Indian mobile (`+91` and ten digits starting 6–9, `isIndianMobile`), checked in the form and in the mutator schema, and is kept only on items that opt in to a voucher. The voucher prints the payee (the "Paid to" name, today the claimant's name) and the mobile, and a **Received by** box: "Signature or thumb impression of the payee" with a date line. The claimant gets it signed and uploads the signed copy as an attachment on the reimbursement. There is no dedicated upload for the signed copy, and the claimant can only edit a request while it is pending, so a signed copy of a voucher generated on approval currently needs an approver with `requests.edit_all_statuses` to attach it.

## Generation

**Async job**: pg-boss `generate-cash-voucher` (payload: `{ approverUserId, lineItemId, reimbursementId }`).

1. Loads the line item, checks the limit and that the reimbursement is approved.
2. Allocates `CV-<year>-<seq>` from `voucher_seq`.
3. `packages/pdf/src/cash-voucher.tsx` renders the PDF (see `pdf.md`).
4. Uploads to R2, then in one transaction inserts the attachment, points `voucher_attachment_id` at it and deletes the previous voucher's row; the old R2 object is removed best-effort.
5. `singletonKey: voucher-<lineItemId>` dedups enqueues.

**Config**: `VOUCHER_ORG_*` env vars (name, address, phone, email, registration) and `VOUCHER_FINANCE_ADMIN_NAME` (the approver printed beside the treasurer signature, `packages/pdf/assets/signature.png`).
