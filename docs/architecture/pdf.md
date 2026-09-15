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

## Kalakriti ID cards

`src/kalakriti-id-cards.tsx` contains reusable React PDF card and document components. `src/generate-kalakriti-id-cards.tsx` validates printable data and returns a PDF buffer. The Kalakriti dashboard downloads the complete current roster through the admin-only `/api/kalakriti/$year/id-cards` endpoint. `apps/web/src/lib/server/kalakriti-id-card-data.ts` projects cards in a read-only repeatable-read transaction.

Cards are 90 x 130 mm, arranged four per A4 page with 6 mm gutters and cutting guides. Hole centers are 19 and 71 mm from the left edge, 7 mm from the top. The original Kalakriti asset is displayed through a clipped viewport to remove transparent margins without changing the source artwork. The festive decoration and QR modules are vector paths.

QR codes use the shared `{ id, type }` person contract: Student UUID, Guardian/Volunteer Edition Membership UUID, or Guest/Judge Attendee UUID. The 48 mm QR area includes a four-module white quiet zone. Student cards include their center name alongside their competitions. Student times are formatted in Asia/Kolkata with AM/PM; a missing time displays `Time TBA`.

`src/kalakriti-id-card-layout.ts` measures text against the embedded Plus Jakarta Sans metrics, wraps it, and tries readable font sizes in the space above the QR. Oversized content fails generation instead of silently clipping or dropping competitions. Use Latin-script display names with the current Plus Jakarta Sans font; additional scripts require an appropriate embedded font.

Generate the five-role sample (two pages) with:

```bash
bun run preview:id-cards
```

The output is `output/pdf/kalakriti-id-cards.pdf`. Print at actual size (100%), with printer scaling disabled. Import `generateKalakritiIdCards` from `@pi-dash/pdf/generate-kalakriti-id-cards.tsx` for server consumers. The endpoint resolves current Edition access and requires global Kalakriti admin or active edition_admin before loading any roster data. The renderer itself does not authorize access.

Card fonts are bundled in `assets/fonts/` from https://github.com/tokotype/PlusJakartaSans (Regular and Bold), with the upstream `OFL.txt` license. They are embedded in each PDF; rendering needs no external font service. The web Vite plugin `kalakriti-pdf-assets.ts` embeds the assets into the server bundle so deployments do not depend on repository paths.
