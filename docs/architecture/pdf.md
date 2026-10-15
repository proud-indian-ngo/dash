# PDF Generation (`packages/pdf`)

> **Load when**: `@react-pdf/renderer`, voucher layout, `amount-to-words`, PDF assets (logo/signature).
> **Related**: `cash-vouchers.md`, `jobs.md`

React PDF (`@react-pdf/renderer`) for cash voucher generation.

| File | Purpose |
|---|---|
| `src/cash-voucher.tsx` | Voucher layout — org details, line items, amounts, signatures |
| `src/amount-to-words.ts` | `paiseToWords`: paise amount → English words for vouchers |
| `assets/logo.png`, `assets/signature.png` | Static assets embedded in PDF |

## Donation receipts

`src/donation-receipt.tsx` (A4, one page) and `src/generate-donation-receipt.tsx` render a receipt from its frozen snapshot on demand; nothing is stored. The receipt follows the product design language (`design-language.md`): the full-colour horizontal lockup (`pi-lockup.svg`, the file the `@proudindian/design` logo README names for receipts) drawn as vector paths by `src/proud-indian-lockup.tsx`, because react-pdf's `<Image>` can't read SVG (re-copy the paths from the package if the logo changes; never edit them), product token hex values, hairlines and one tinted amount card. Layout: lockup and issuer, title with number and date, void banner, donor, amount in figures and words, details table, then the 80G notes beside the signature, with a fixed footer. It stays readable in black and white, and typical long names and addresses fit one page. At the input maximums (300-character void reason and organisation address, long donor address and "other" description) it spills to a second page: the notes and signature move together, and a voided receipt carries a fixed VOID marker at the top of every page as well as the void sentence on page one. Names, numbers and legal lines wrap between words and are never hyphenated; a run of more than 40 characters with no spaces (a pasted reference) may break between characters, and react-pdf draws a hyphen at such a break because it can't break without one. Fonts are static TTFs in `assets/fonts/` (react-pdf can't read woff2), listed in `src/receipt-assets.ts`: Geist Regular and SemiBold (upstream `geist` npm 1.7.2, Geist 1.800, the full Latin set with ₹), Bricolage Grotesque 600 for the title, and Paper Mono 400/500 for the amount, number and dates, the last two instanced with fontTools from the variable woff2 files in `@proudindian/design/fonts` (the Bricolage name table rewritten to `BricolageGrotesque-SemiBold`); their OFL licences sit beside them. The big amount and the No./Date values use Paper Mono rather than the display face `design-language.md` gives big numbers and dates, because Bricolage has no ₹. Every family falls back per glyph to the bundled Plus Jakarta Sans (`ReceiptFallback`), which carries the dotted IAST letters (ṭ ḍ ṇ ṣ ṛ ḥ ṃ ṅ) Geist and Paper Mono lack; without it react-pdf substitutes a non-embedded Helvetica. Devanagari and other Indian scripts still don't render (no bundled font has them, as before this redesign). The web Vite plugin `kalakriti-pdf-assets.ts` embeds both asset maps into the server bundle. The Kalakriti cards and the cash voucher keep their own fonts and logo. The document's creation and modification dates are the issue day, so the same receipt always renders the same bytes (a retried email attaches an identical file under the same idempotency key). `packages/jobs/src/lib/receipt-pdf.ts` maps the snapshot to props for the download route and the email job. Amounts in words use `paiseToIndianWords` from `@pi-dash/shared/amount-in-words` (lakh and crore, "rupees and paise"). See `finance-and-programmes.md`, "Donation receipts".

Voucher flow: `generate-cash-voucher` job → queries reimbursement + line items → renders PDF → uploads to R2 → attaches to reimbursement record. Env vars `VOUCHER_ORG_*` configure org details on the voucher.

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
