# PDF generation (`packages/pdf`)

> **Load when**: `@react-pdf/renderer`, voucher, receipt, circular, minutes or Kalakriti ID-card layout, rich text in a PDF, PDF fonts and assets.
> **Related**: `cash-vouchers.md` (voucher content), `finance-receipts-and-returns.md` ("Donation receipts and numbering"), `design-language.md`

`@react-pdf/renderer` draws cash vouchers, donation receipts, circulars, board minutes and Kalakriti ID cards. This chapter covers rendering, fonts and assets; what each document contains and when it is produced belongs to its feature chapter. Receipt, voucher, circular and minutes share `src/product-pdf.tsx`.

## Shared rules

- **Assets in the bundle.** The production image ships only `.output`, so PDFs never read the source tree at runtime. The web Vite plugin `apps/web/src/lib/dev/kalakriti-pdf-assets.ts` embeds every asset map into the server bundle as data URLs.
- **Deterministic bytes.** Creation and modification dates are fixed (receipt: issue day; voucher: expense date), so the same document always renders the same bytes. A retried receipt email attaches an identical file under the same idempotency key.
- **Logo as vectors.** react-pdf's `<Image>` cannot read SVG, so `proud-indian-lockup.tsx` holds the paths of `pi-lockup.svg` from `@proudindian/design`. If the logo changes, re-copy the paths; never edit them.
- **Product design language** (`design-language.md`): readable in black and white.

## Fonts (product documents)

Static TTFs in `assets/fonts/`, because react-pdf cannot read woff2.

- Paper Mono sets the big amount instead of the display face, because Bricolage has no ₹.
- Plus Jakarta Sans (`ReceiptFallback`) is the per-glyph fallback for every family. It carries the IAST letters the others lack; without it react-pdf substitutes a non-embedded Helvetica.

- Geist Italic and SemiBold Italic come from the Geist release, since the design package has no italics. The fallback's italic is its upright face.

Bricolage and Paper Mono are instanced with fontTools from the variable woff2 files in `@proudindian/design/fonts`. Devanagari and other Indian scripts do not render; no bundled font has them.

## Rich text

`src/rich-text.tsx` draws stored rich text (`@pi-dash/shared/rich-text`) for the circular and the minutes, in the caller's paragraph style.

- Bold is SemiBold, italic and underline are real; empty paragraphs take no space.
- Lists hang the text after the marker; numbered lists go 1, a, i by the numbered lists they sit in (`listNumber`), as the pages do.
- Tables have thin black borders and a bold header row on a light wash. Half the width is shared equally and half follows each column's longest cell (6 to 40 characters' weight), so at the eight-column cap no column is under 31pt. A row taller than the space left breaks across pages like text, so no cell is cut.
- The signature pages draw at fixed page coordinates, so rich text moves nothing there.

## Donation receipt

Rendered on demand from the frozen snapshot; nothing is stored. Snapshot-to-props mapping is in `packages/jobs/src/lib/receipt-pdf.ts`, shared by the download route and the email job. Amounts in words use lakh and crore.

- At the input maximums it spills to a second page; notes and signature move together, and a voided receipt repeats a VOID marker on every page.
- A run over 40 characters with no spaces may break mid-word, and react-pdf draws a hyphen there.

## Cash voucher

Content is defined in `cash-vouchers.md`.

- The job validates the payee signature PNG before react-pdf decodes it.
- Long descriptions spill to a second page, where Approved by and Received by move together and the footer repeats the voucher number.

## Kalakriti ID cards

- **Roster download**: the endpoint authorises before loading roster data; the renderer itself does not. `apps/web/src/lib/server/kalakriti-id-card-data.ts` projects cards in a read-only repeatable-read transaction.
- **Blank cards**: each card gets a fresh UUIDv7 person QR. Downloading creates no people; registering the card later links the scanned UUID to a new person.
- **Layout**: A4 split edge-to-edge into a 2×2 with one vertical and one horizontal through-cut. The source artwork is clipped to remove transparent margins, never edited.
- **QR**: the shared `{ id, type }` person contract ([Kalakriti](kalakriti-registration.md#detail-sheet-json-qr-codes)). The QR area includes a four-module quiet zone.
- **Text fitting**: `kalakriti-id-card-layout.ts` measures against embedded font metrics. Oversized content fails generation instead of clipping. Only Latin-script names render.

Preview the sample with `bun run preview:id-cards`. Print at 100% with printer scaling off.
