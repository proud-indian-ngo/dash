# PDF Generation (`packages/pdf`)

> **Load when**: `@react-pdf/renderer`, voucher layout, `amount-to-words`, PDF assets (logo/signature).
> **Related**: `cash-vouchers.md`, `jobs.md`

React PDF (`@react-pdf/renderer`) for cash vouchers, donation receipts and Kalakriti ID cards.

| File | Purpose |
|---|---|
| `src/product-pdf.tsx` | Shared by the receipt and the voucher: font registration and fallback chain, product tokens, base styles, `Line`, `Fact`, `Meta`, `wholeWords`, `documentDate` |
| `src/cash-voucher.tsx` | Voucher layout (see "Cash vouchers" below) |
| `src/voucher-assets.ts` | Flat map of the voucher's images (the treasurer signature) |
| `src/amount-to-words.ts` | `paiseToWords`: paise amount → English words for vouchers |
| `assets/signature.png` | Treasurer signature drawn on vouchers |

## Donation receipts

`src/donation-receipt.tsx` (A4, one page) and `src/generate-donation-receipt.tsx` render a receipt from its frozen snapshot on demand; nothing is stored. The receipt follows the product design language (`design-language.md`): the full-colour horizontal lockup (`pi-lockup.svg`, the file the `@proudindian/design` logo README names for receipts) drawn as vector paths by `src/proud-indian-lockup.tsx`, because react-pdf's `<Image>` can't read SVG (re-copy the paths from the package if the logo changes; never edit them), product token hex values, hairlines and one tinted amount card. Layout: lockup and issuer, title with number and date, void banner, donor, amount in figures and words, details table, then the 80G notes beside the signature, with a fixed footer. It stays readable in black and white, and typical long names and addresses fit one page. At the input maximums (300-character void reason and organisation address, long donor address and "other" description) it spills to a second page: the notes and signature move together, and a voided receipt carries a fixed VOID marker at the top of every page as well as the void sentence on page one. Names, numbers and legal lines wrap between words and are never hyphenated; a run of more than 40 characters with no spaces (a pasted reference) may break between characters, and react-pdf draws a hyphen at such a break because it can't break without one. Fonts are static TTFs in `assets/fonts/` (react-pdf can't read woff2), listed in `src/receipt-assets.ts`: Geist Regular and SemiBold (upstream `geist` npm 1.7.2, Geist 1.800, the full Latin set with ₹), Bricolage Grotesque 600 for the title, and Paper Mono 400/500 for the amount, number and dates, the last two instanced with fontTools from the variable woff2 files in `@proudindian/design/fonts` (the Bricolage name table rewritten to `BricolageGrotesque-SemiBold`); their OFL licences sit beside them. The big amount and the No./Date values use Paper Mono rather than the display face `design-language.md` gives big numbers and dates, because Bricolage has no ₹. Every family falls back per glyph to the bundled Plus Jakarta Sans (`ReceiptFallback`), which carries the dotted IAST letters (ṭ ḍ ṇ ṣ ṛ ḥ ṃ ṅ) Geist and Paper Mono lack; without it react-pdf substitutes a non-embedded Helvetica. Devanagari and other Indian scripts still don't render (no bundled font has them, as before this redesign). The fonts, tokens and primitives live in `src/product-pdf.tsx`, which the cash voucher shares; the receipt renders the same bytes as before the split. The web Vite plugin `kalakriti-pdf-assets.ts` embeds the asset maps into the server bundle. The Kalakriti cards keep their own fonts and logo. The document's creation and modification dates are the issue day, so the same receipt always renders the same bytes (a retried email attaches an identical file under the same idempotency key). `packages/jobs/src/lib/receipt-pdf.ts` maps the snapshot to props for the download route and the email job. Amounts in words use `paiseToIndianWords` from `@pi-dash/shared/amount-in-words` (lakh and crore, "rupees and paise"). See `finance-and-programmes.md`, "Donation receipts".

## Cash vouchers

`src/cash-voucher.tsx` (A4, one page) is drawn in the same product language as the receipt, from `src/product-pdf.tsx`: the lockup with the issuing organisation (`VOUCHER_ORG_*`), the title "Cash voucher" with No. and Date in Paper Mono, "Paid to" with the payee's name (the claimant on items from before the payee fields) and mobile when given, the amount card with figures and words, a Description, Category and Claimed by table, then "Approved by" (the treasurer signature from `signature.png`, `VOUCHER_FINANCE_ADMIN_NAME`, Treasurer) beside the **Received by** box for the payee's signature or thumb impression and a date line, and a fixed footer. Long names and addresses stay on one page, and descriptions up to about 700 characters do even with long names elsewhere; a longer description spills to a second page, where the Approved by and Received by boxes move together and the fixed footer repeats the voucher number. The creation and modification dates are the expense date, so the same voucher renders the same bytes. The signature reaches the server bundle through `src/voucher-assets.ts` and the Vite plugin as a data URL; before this the voucher read `assets/logo.png` and `signature.png` from a source-tree path that the production image (which ships only `.output`) doesn't have, so deployed vouchers printed neither. Flow, limit, payee and signed copy: `cash-vouchers.md`.

## Kalakriti ID cards

The dashboard also offers **Download blank ID cards**. Administrators choose whole page counts for Volunteer, Guest, and Judge cards, from 1 to 100 pages total. `generate-blank-kalakriti-id-cards.tsx` renders four cards per page, grouped by type, with a write-in name line and a fresh UUIDv7 person QR for every card. Downloading does not create people; **Register ID card** links the scanned UUID to a new person later.

`src/kalakriti-id-cards.tsx` contains reusable React PDF card and document components. `src/generate-kalakriti-id-cards.tsx` validates printable data and returns a PDF buffer. The Kalakriti dashboard downloads the complete current roster through the admin-only `/api/kalakriti/$year/id-cards` endpoint. `apps/web/src/lib/server/kalakriti-id-card-data.ts` projects cards in a read-only repeatable-read transaction.

Cards fill A4 edge-to-edge as a 2×2 of 105 × 148.5 mm (the 90 × 130 mm artwork is scaled to each quadrant). One vertical and one horizontal through-cut at the midlines separate the four cards. Hole centers scale with the artwork from 19 and 71 mm left and 7 mm from the top in design space. The original Kalakriti asset is displayed through a clipped viewport to remove transparent margins without changing the source artwork. The festive decoration and QR modules are vector paths.

QR codes use the shared `{ id, type }` person contract: Student UUID, Guardian/Volunteer Edition Membership UUID, or Guest/Judge Attendee UUID. The 48 mm QR area includes a four-module white quiet zone. Student cards include their center name alongside their competitions. Student times are formatted in Asia/Kolkata with AM/PM; a missing time displays `Time TBA`.

`src/kalakriti-id-card-layout.ts` measures text against the embedded Plus Jakarta Sans metrics, wraps it, and tries readable font sizes in the space above the QR. Oversized content fails generation instead of silently clipping or dropping competitions. Use Latin-script display names with the current Plus Jakarta Sans font; additional scripts require an appropriate embedded font.

Generate the five-role sample (two pages) with:

```bash
bun run preview:id-cards
```

The output is `output/pdf/kalakriti-id-cards.pdf`. Print at actual size (100%), with printer scaling disabled. Import `generateKalakritiIdCards` from `@pi-dash/pdf/generate-kalakriti-id-cards.tsx` for server consumers. The endpoint resolves current Edition access and requires global Kalakriti admin or active edition_admin before loading any roster data. The renderer itself does not authorize access.

Card fonts are bundled in `assets/fonts/` from https://github.com/tokotype/PlusJakartaSans (Regular and Bold), with the upstream `OFL.txt` license. They are embedded in each PDF; rendering needs no external font service. The web Vite plugin `kalakriti-pdf-assets.ts` embeds the assets into the server bundle so deployments do not depend on repository paths.
