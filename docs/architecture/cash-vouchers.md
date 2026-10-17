# Cash vouchers

> **Load when**: cash voucher, `generate-cash-voucher`, `VOUCHER_ORG_*`, cash-voucher limit, voucher payee, signed voucher copy, payee signature.
> **Related**: `pdf.md` (rendering), `reimbursements.md`, `finance-books.md` ("Voiding")

A cash voucher stands in for a bill on a reimbursement line paid in cash where no invoice is possible, such as a labourer paid for a one-time job. Users opt in per line item. Vouchers generate on approval, and an approver can generate or regenerate one from the request.

## Limit

Only line items up to the cash-voucher limit qualify.

- Finance sets it in Settings, allowed ₹1 to ₹10,000. The ₹10,000 cap exists because cash above it paid to one person in a day does not count as spending on the trust's objects.
- `packages/shared/src/cash-voucher.ts` holds the rules. A missing or invalid stored value falls back to the default, so it can never exceed the cap.
- Mutators read the limit inside the transaction; the server's database value decides. `generateVoucher` refuses an item over the limit. `approve` queues vouchers only for opted-in items within it. `create` and `update` silently drop an opt-in on an item over it.
- The `generate-cash-voucher` job re-checks and skips an over-limit item.
- Lowering the limit never touches existing vouchers. An opted-in item that no longer qualifies loses Regenerate.

## Payee

An opted-in item has a payee name and optional Indian mobile, kept only on opted-in items.

- The name must be in Latin script (IAST allowed), because the voucher fonts cannot print other scripts.
- The payee is checked only on items that will get a voucher. If the limit changes between load and save, the server drops a no-longer-eligible opt-in rather than refusing; this is the only silent drop.
- "Paid to the claimant" has no column: the item stores a null payee and the payload carries `payeeIsClaimant` explicitly, so a missing name is a choice. The voucher then prints the current claimant, so the payee follows a claimant change.

## What the voucher prints

Content decisions live in `packages/jobs/src/handlers/voucher-render-check.ts`.

- "Paid to" prints the payee's name and mobile. With no payee stored, it prints the claimant and their profile mobile when it is an Indian mobile. The mobile is read at render time; a later profile change does not regenerate.
- The claimant appears as "Claimed by", printed as stored.
- The **Received by** box holds one of:
  - the payee's drawn signature with name and signing time (India time);
  - for claimant-paid items, a declaration dated at submission, naming the creator too when someone else raised the claim;
  - otherwise an empty box for a signature or thumb impression.

## Payee signature

The payee can sign on the volunteer's phone instead of paper. Collection is offered on a voucher item with a named payee, within the limit, to the claimant, `finance.manage` and `requests.approve`, while the request is pending or rejected. What it shows is frozen when it opens.

- The statement above the pad comes from `payeeSignatureStatement` (`packages/shared/src/payee-signature.ts`).
- The pad stores strokes as fractions of its size above the sheet/dialog switch, so rotation or resize redraws them. It sets `touch-action: none` and `data-base-ui-swipe-ignore` so drawing does not scroll or swipe the drawer.

`reimbursement.collectPayeeSignature`:

- refuses voided and approved requests and claimant-paid items;
- locks the request row and re-checks status and void, so approval cannot slip in;
- compares the facts the client signed against (amount, category, description, expense day, payee name) with the item and refuses any difference; the server then writes the stored statement itself;
- refuses a racing re-collect (`replacesAttachmentId`) and a durable key another attachment already holds;
- claims the PNG with `contentCheck: "payeeSignature"` (`apps/web/src/lib/r2-upload-claim.ts`), which checks size and PNG header limits before decoding. This blocks small PNGs that inflate to gigabytes, since jobs run in the web process;
- writes a history note keeping the attachment, line item and statement, so the statement outlives later edits. The audit ledger stores IDs only.

A replaced signature's file stays among the attachments. Without a signature, the payee signs the printed voucher.

## Signed copy

Once a voucher exists on an approved request, the claimant, `finance.manage` and `requests.approve` can upload a signed copy without reopening the claim (`reimbursement.attachSignedVoucher`). `replacesAttachmentId` must match, so two uploads cannot race. A replaced copy stays among the attachments as evidence.

## Edits and staleness

`reimbursement.update` deletes and re-inserts line items; `planVoucherFields` decides what survives.

- A voucher survives when everything it prints is unchanged (amount, description, category, expense day as a calendar day in India, and payee name and mobile for a still-eligible voucher item) and its file is still attached under the same id and key. The signed copy is checked the same way. Its opt-in and payee are then kept even if the limit has since dropped.
- Otherwise the links are dropped (files stay as attachments) and the item is treated as new. On an approved request, an admin's edit queues vouchers for every new, changed or missing opted-in item.
- Ticking or unticking "paid to the claimant" counts as a payee change and regenerates.
- The payee signature follows the same rule independently, and also needs its PNG still attached. When stale, it is cleared, the PNG stays as evidence, history notes it, and an approved request queues a fresh voucher. An edit cannot remove the linked PNG.
- `update` takes the same row lock as signature collection, so a signature collected meanwhile is not wiped.
- Regenerating a voucher unlinks the signed copy (signed against the old number) but keeps the payee signature.
- `reimbursement.changeClaimant` unlinks every voucher and signed copy and, when approved, queues fresh vouchers. The payee signature stays, as its statement names neither voucher nor claimant.

## Generation

pg-boss job `generate-cash-voucher` (`packages/jobs/src/handlers/generate-cash-voucher.ts`).

- It checks the limit, that the request is approved and not voided.
- A missing, oversized or invalid payee signature PNG prints the empty box and is logged; other storage errors throw so the job retries.
- Numbers are `CV-<year>-<seq>` from `voucher_seq`. Linking the new PDF clears the signed copy and replaces the previous voucher; the old R2 object is removed best-effort.
- The commit locks the item and links the PDF only if the item still holds what was rendered. Otherwise the PDF is discarded and the newer job wins. If only the signature changed, nothing else queued a job, so it re-queues itself.

The queue uses the `stately` policy with `singletonKey: voucher-<lineItemId>`: one queued and one running job per item. pg-boss cannot change an existing queue's policy, so an older deployment keeps `standard` until the queue is recreated. Duplicates are still harmless because of the commit check, but each draws a number, so voucher numbers can have gaps there.

Config: `VOUCHER_ORG_*` and `VOUCHER_FINANCE_ADMIN_NAME` (printed beside the treasurer signature).

## Voided reimbursements

A voided reimbursement keeps its vouchers, signed copies and their numbers (`voucher_seq` never reissues). Regenerate and upload are not offered, and the job makes no voucher for a voided request.
