# Cash vouchers

> **Load when**: cash voucher, `generate-cash-voucher`, `VOUCHER_ORG_*`, reimbursement line item voucher flow, cash-voucher limit, voucher payee, signed voucher copy, payee signature, signature pad.
> **Related**: `pdf.md` (rendering, fonts, assets), `jobs.md`, `file-uploads.md`, `finance-and-programmes.md` ("Claim for others"), `finance-books.md` ("Voiding")

A cash voucher stands in for a bill on a reimbursement line paid in cash where no invoice is possible, such as a labourer paid for a one-time job. Users opt in per line item. Vouchers generate on approval, and an approver can generate or regenerate one from the request.

## Limit

Only line items up to the cash-voucher limit qualify.

- Finance sets it in Settings → Programmes → Cash vouchers (`finance.manage` or `settings.app_config`). It is stored in `app_config` as `cash_voucher_limit_paise`. Default ₹1,000, allowed ₹1 to ₹10,000. The ₹10,000 cap exists because cash above it paid to one person in a day does not count as spending on the trust's objects.
- `packages/shared/src/cash-voucher.ts` holds the key, default, cap, `parseCashVoucherLimit` (a missing or invalid row falls back to the default, so it can never exceed the cap) and `qualifiesForCashVoucher`.
- `appConfig.upsert` refuses values outside the range. Writes are audited like other `app_config` writes.
- Zero mutators (`packages/zero/src/mutators/reimbursement.ts`) read the limit with `readCashVoucherLimit(tx)`; the server's database value decides. `generateVoucher` refuses an item over the limit. `approve` queues vouchers only for opted-in items within it. `create` and `update` silently drop an opt-in on an item over it.
- The `generate-cash-voucher` job re-checks and skips an over-limit item (`amount_exceeds_threshold`).
- The UI reads it through `useCashVoucherLimit()`.
- Lowering the limit never touches existing vouchers. An opted-in item that no longer qualifies shows "Over the ₹… voucher limit" and loses Regenerate.

## Payee

Ticking "Generate cash voucher" shows **Paid to** (`reimbursement_line_item.payee_name`, max 120 characters) and optional **Payee's mobile** (`payee_phone`, Indian mobile in E.164, `isIndianMobile`). Both are kept only on opted-in items.

- The name is required and must be in English letters (Latin including IAST, digits, spaces and `. ' - & / , ( )`), stored in NFC (`isLatinName`), because the voucher fonts cannot print other scripts.
- The form and `normalizeVoucherFields` (`packages/zero/src/mutators/voucher-fields.ts`) check the payee only on items that will get a voucher. If the limit changes between load and save, the server drops a no-longer-eligible opt-in rather than refusing; this is the only silent drop.
- **Paid to me** (or **Paid to <name> (the claimant)**) hides the payee fields. There is no column for it: the item stores a null payee and the payload carries `payeeIsClaimant` explicitly, so a missing name is a choice. The voucher then prints the current claimant, so the payee follows a claimant change. The edit form ticks this box for voucher items with no stored payee. New items start unticked.

## What the voucher prints

Layout and rendering are in `pdf.md`. Content decisions live in `packages/jobs/src/handlers/voucher-render-check.ts`:

- "Paid to" prints the payee's name and mobile. With no payee stored, it prints the claimant and their profile mobile when it is an Indian mobile (`voucherPayee`). The mobile is read at render time; a later profile change does not regenerate.
- The claimant appears as "Claimed by", printed as stored.
- The **Received by** box beside the treasurer's signature holds one of:
  - the payee's drawn signature with name and signing time (India time);
  - for claimant-paid items, a declaration (`claimantDeclaration`): "Declared electronically by {claimant} (claimant) on {date, time}, when the claim was submitted", using `submitted_at` (else `created_at`). When `created_by` is not the claimant, it reads "Raised by {creator} for {claimant} on …; no payee signature needed as the claimant was paid";
  - otherwise an empty box for a signature or thumb impression, with a date line.

## Payee signature

The payee can sign on the volunteer's phone instead of paper.

**Collect payee signature** appears on a voucher item with a named payee, within the limit, to the claimant, `finance.manage` and `requests.approve`, while the request is pending or rejected. It opens a full-screen `Sheet` on phones (including landscape phones under 540px tall) and a dialog on wider screens (`collect-payee-signature-dialog.tsx`). What it shows is frozen when it opens.

- The statement above the pad comes from `payeeSignatureStatement` (`packages/shared/src/payee-signature.ts`): "I, {payee}, received ₹{amount} from Proud Indian for {purpose} on {date}."
- The pad (`components/shared/signature-pad.tsx`) is a 2:1 pointer-events canvas, one pointer at a time, no pressure, no geolocation. Strokes are stored as fractions of the pad (`lib/signature-ink.ts`) above the sheet/dialog switch, so rotation or resize redraws them. It sets `touch-action: none` and `data-base-ui-swipe-ignore` so drawing does not scroll or swipe the drawer.
- Confirm stays disabled until `hasEnoughInk` (strokes span at least half the width and 15% of the height).
- Confirm crops to a PNG on white (`signaturePngBlob`, max 1200 × 600), uploads via `getRequestUploadUrl` and calls `reimbursement.collectPayeeSignature`.

`collectPayeeSignature`:

- allows the claimant, `finance.manage` or `requests.approve`; refuses voided and approved requests ("locked once the request is approved") and claimant-paid items;
- locks the request row (`SELECT … FOR UPDATE`) and re-checks status and void, so approval cannot slip in;
- compares the facts the client signed against (amount, category, description, expense day, payee name) with the item and refuses any difference; the server then writes the stored statement itself;
- refuses a racing re-collect (`replacesAttachmentId`) and a durable key another attachment already holds;
- claims the PNG into `attachments/reimbursements/<id>/` with `contentCheck: "payeeSignature"` (`apps/web/src/lib/r2-upload-claim.ts`). The claim reads in chunks and refuses files over 512 KB or whose PNG header is not 8-bit RGB/RGBA, non-interlaced, within 1200 × 600 and at least 16 px a side with a 64 px longest side (`payeeSignatureImageProblem`). This blocks small PNGs that inflate to gigabytes, since jobs run in the web process;
- inserts a `reimbursement_attachment` (`payee-signature.png`) and sets `payee_signature_attachment_id`, `_statement`, `_captured_at` (server time) and `_captured_by`;
- writes a history note keeping the attachment, line item and statement, so the statement outlives later edits. The audit ledger stores IDs only.

The item then shows "Signed by {payee} · {time}" with a thumbnail and Re-collect until approval. A replaced signature's file stays among the attachments. Without a signature, the payee signs the printed voucher.

## Signed copy

Once a voucher exists on an approved request, the claimant, `finance.manage` and `requests.approve` can **Upload signed copy** (then **Replace signed copy**) without reopening the claim. `reimbursement.attachSignedVoucher` claims the upload into `attachments/reimbursements/<id>/`, sets `signed_voucher_attachment_id` and writes a history note. `replacesAttachmentId` must match, so two uploads cannot race. A replaced copy stays among the attachments as evidence.

## Edits and staleness

`reimbursement.update` deletes and re-inserts line items; `planVoucherFields` decides what survives.

- A voucher survives when everything it prints is unchanged (amount, description, category, expense day as a calendar day in India, and payee name and mobile for a still-eligible voucher item) and its file is still attached under the same id and key. The signed copy is checked the same way. Its opt-in and payee are then kept even if the limit has since dropped.
- Otherwise the links are dropped (files stay as attachments) and the item is treated as new. On an approved request, an admin's edit queues vouchers for every new, changed or missing opted-in item.
- Ticking or unticking "paid to the claimant" counts as a payee change and regenerates.
- The payee signature follows the same rule independently, and also needs its PNG still attached. When stale, its four columns are cleared, the PNG stays as evidence, history says "Payee signature cleared: the item changed after it was signed", and an approved request queues a fresh voucher. An edit cannot remove the linked PNG.
- `update` takes the same row lock as signature collection, so a signature collected meanwhile is not wiped.
- Regenerating a voucher unlinks the signed copy (signed against the old number) but keeps the payee signature.
- `reimbursement.changeClaimant` unlinks every voucher and signed copy and, when approved, queues fresh vouchers. The payee signature stays, as its statement names neither voucher nor claimant.

## Generation

pg-boss job `generate-cash-voucher` (`packages/jobs/src/handlers/generate-cash-voucher.ts`), payload `{ approverUserId, lineItemId, reimbursementId }`.

1. Loads the item; checks the limit, that the request is approved and not voided.
2. Reads the payee signature PNG from R2 if linked (`readPayeeSignatureImage`), checking size before download and header before decode. A missing, oversized or invalid file prints the empty box and is logged; other storage errors throw so the job retries.
3. Allocates `CV-<year>-<seq>` from `voucher_seq` and renders `packages/pdf/src/cash-voucher.tsx`.
4. Uploads to R2. In one transaction, inserts the attachment, sets `voucher_attachment_id`, clears `signed_voucher_attachment_id` and deletes the previous voucher row. The old R2 object is removed best-effort.
5. The commit locks the item and links the PDF only if the item still holds what was rendered (amount, description, category, payee, signature, expense date, claimant). Otherwise the PDF is discarded and the newer job wins. If only the signature changed, nothing else queued a job, so it re-queues itself.

The queue uses the `stately` policy with `singletonKey: voucher-<lineItemId>`: one queued and one running job per item. pg-boss cannot change an existing queue's policy, so an older deployment keeps `standard` until the queue is recreated. Duplicates are still harmless because of the commit check, but each draws a number, so voucher numbers can have gaps there.

Config: `VOUCHER_ORG_NAME`, `_ADDRESS`, `_PHONE`, `_EMAIL`, `_REGISTRATION`, and `VOUCHER_FINANCE_ADMIN_NAME` (printed beside the treasurer signature).

## Voided reimbursements

A voided reimbursement keeps its vouchers, signed copies and their numbers (`voucher_seq` never reissues). The detail page marks each VOID and offers no regenerate or upload, and the job makes no voucher for a voided request.
