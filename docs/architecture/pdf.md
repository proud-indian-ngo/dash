# PDF generation (`packages/pdf`)

> **Load when**: `@react-pdf/renderer`, voucher or receipt layout, `amount-to-words`, PDF fonts and assets, Kalakriti ID cards.
> **Related**: `cash-vouchers.md` (voucher flow and content), `finance-receipts-and-returns.md` ("Donation receipts and numbering"), `design-language.md`, `jobs.md`

`@react-pdf/renderer` draws cash vouchers, donation receipts and Kalakriti ID cards. This chapter covers rendering, fonts and assets; what each document contains and when it is produced belongs to its feature chapter.

| File | Purpose |
|---|---|
| `src/product-pdf.tsx` | Shared by receipt and voucher: font registration and fallback, product tokens, base styles, `Line`, `Fact`, `Meta`, `wholeWords`, `documentDate` |
| `src/proud-indian-lockup.tsx` | The horizontal logo lockup as vector paths |
| `src/donation-receipt.tsx`, `src/generate-donation-receipt.tsx` | Receipt layout and render |
| `src/cash-voucher.tsx`, `src/generate-voucher.ts` | Voucher layout and render |
| `src/receipt-assets.ts`, `src/voucher-assets.ts`, `src/kalakriti-id-card-assets.ts` | Asset maps (fonts, treasurer signature, card artwork) |
| `src/amount-to-words.ts` | `paiseToWords` for vouchers |
| `src/kalakriti-id-cards.tsx`, `src/kalakriti-id-card-layout.ts`, `src/generate-kalakriti-id-cards.tsx`, `src/generate-blank-kalakriti-id-cards.tsx` | ID cards |
| `assets/signature.png` | Treasurer signature on vouchers |

## Shared rules

- **Assets in the bundle.** The production image ships only `.output`, so PDFs never read the source tree at runtime. The web Vite plugin `apps/web/src/lib/dev/kalakriti-pdf-assets.ts` embeds every asset map into the server bundle as data URLs.
- **Deterministic bytes.** Creation and modification dates are fixed (receipt: issue day; voucher: expense date), so the same document always renders the same bytes. A retried receipt email attaches an identical file under the same idempotency key.
- **Logo as vectors.** react-pdf's `<Image>` cannot read SVG, so `proud-indian-lockup.tsx` holds the paths of `pi-lockup.svg` from `@proudindian/design`. If the logo changes, re-copy the paths; never edit them.
- **Product design language** (`design-language.md`): token hex values, hairlines, one tinted amount card, readable in black and white.

## Fonts (receipt and voucher)

Static TTFs in `assets/fonts/` (react-pdf cannot read woff2), with their OFL licences:

- Geist Regular and SemiBold (from the `geist` npm package): body.
- Bricolage Grotesque 600: title.
- Paper Mono 400/500: amount, number and dates. Used for the big amount instead of the display face because Bricolage has no ₹.
- Plus Jakarta Sans (`ReceiptFallback`): per-glyph fallback for every family. It carries the IAST letters (ṭ ḍ ṇ ṣ ṛ ḥ ṃ ṅ) the others lack; without it react-pdf substitutes a non-embedded Helvetica.

Bricolage and Paper Mono are instanced with fontTools from the variable woff2 files in `@proudindian/design/fonts` (Bricolage's name table rewritten to `BricolageGrotesque-SemiBold`). Devanagari and other Indian scripts do not render; no bundled font has them.

## Donation receipt

A4. Snapshot-to-props mapping is in `packages/jobs/src/lib/receipt-pdf.ts`, used by the download route and the email job. Rendered on demand from the frozen snapshot; nothing is stored. Amounts in words use `paiseToIndianWords` from `@pi-dash/shared/amount-in-words` (lakh and crore).

- Order: lockup and issuer, title with number and date, void banner, donor, amount in figures and words, details table, 80G notes beside the signature, fixed footer.
- Typical content fits one page. At the input maximums (300-character void reason or organisation address, long donor address) it spills to a second page; notes and signature move together, and a voided receipt repeats a VOID marker on every page.
- Text wraps between words without hyphenation. A run over 40 characters with no spaces may break mid-word, and react-pdf draws a hyphen there.

## Cash voucher

A4, same language and primitives as the receipt. Content (payee, claimant, Received by box) is defined in `cash-vouchers.md`.

- Order: lockup with the issuing organisation (`VOUCHER_ORG_*`), "Cash voucher" with No. and Date, Paid to, amount card in figures and words, Description / Category / Claimed by table, then "Approved by" (treasurer signature, `VOUCHER_FINANCE_ADMIN_NAME`) beside Received by, fixed footer.
- The payee signature is passed as `payeeSignature` (PNG bytes and signing time); the job validates it before react-pdf decodes it. The declaration box grows for long names.
- Descriptions up to about 700 characters stay on one page. Longer ones spill to a second page, where Approved by and Received by move together and the footer repeats the voucher number.

## Kalakriti ID cards

- **Roster download**: the admin-only `/api/kalakriti/$year/id-cards` endpoint requires global Kalakriti admin or an active edition_admin before loading roster data; the renderer itself does not authorise. `apps/web/src/lib/server/kalakriti-id-card-data.ts` projects cards in a read-only repeatable-read transaction. Server code imports `generateKalakritiIdCards` from `@pi-dash/pdf/generate-kalakriti-id-cards.tsx`.
- **Blank cards**: administrators choose whole page counts of Volunteer, Guest and Judge cards (1 to 100 pages). Each card gets a write-in name line and a fresh UUIDv7 person QR. Downloading creates no people; **Register ID card** later links the scanned UUID to a new person.
- **Layout**: A4 split edge-to-edge into a 2×2 of 105 × 148.5 mm, with one vertical and one horizontal through-cut. The 90 × 130 mm artwork scales to each quadrant; hole centres scale from 19 and 71 mm left, 7 mm from the top. The source artwork is clipped to remove transparent margins, never edited. Decoration and QR modules are vector paths.
- **QR**: the shared `{ id, type }` person contract (Student UUID, Guardian/Volunteer Edition Membership UUID, Guest/Judge Attendee UUID). The 48 mm QR area includes a four-module quiet zone.
- **Content**: student cards show centre name and competitions, with times in Asia/Kolkata (AM/PM) or `Time TBA`.
- **Text fitting**: `kalakriti-id-card-layout.ts` measures against embedded Plus Jakarta Sans metrics and tries readable sizes in the space above the QR. Oversized content fails generation instead of clipping. Only Latin-script names render.
- **Fonts**: Plus Jakarta Sans Regular and Bold from the upstream repository, with `OFL.txt`, embedded in each PDF. Cards keep their own fonts and logo.

Preview the five-role sample (`output/pdf/kalakriti-id-cards.pdf`) with `bun run preview:id-cards`. Print at 100% with printer scaling off.
