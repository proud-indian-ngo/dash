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

- Bold is SemiBold; italic, underline and strikethrough are real; empty paragraphs take no space.
- Headings are semibold at 1.5, 0.5 and 0pt over the text size (12, 11 and 10.5pt on a circular), below the 13pt resolution title. An indent level is 18pt, short of a narrow cell's least room for text.
- A quote has a grey left rule; a divider is a hairline.
- A link prints its text and then its address in brackets unless the text is the address, since a signed copy can't be clicked through. A word holding an address stays whole while it fits the line, because react-pdf draws a hyphen wherever it breaks a word.
- Lists hang the text after the marker; numbered lists go 1, a, i by the numbered lists they sit in (`listNumber`), as the pages do.
- Tables have thin black borders and a bold header row on a light wash. Columns follow the editor's widths in proportion when it set them; otherwise half the width is shared equally and half follows each column's longest cell (6 to 40 characters' weight). Either way no column is under half an equal share, 31pt at the eight-column cap. A merged cell takes the widths of its columns. A row taller than the space left breaks across pages like text, so no cell is cut. react-pdf drops the bottom border and padding of a split view and the top ones of its continuation, so the table repeats a `fixed` rule at its top and bottom edges, and each cell a `fixed` spacer for its top padding, on every page it spans.
- Cells merge only across a row. react-pdf lays a table out as flex rows, with no table or grid layout: a cell spanning rows would need row heights it can't share, spans that interleave can't be nested as flex boxes, and a row breaking across pages would cut a tall merged cell.
- The signature pages draw at fixed page coordinates, so rich text moves nothing there.

## Donation receipt

Rendered once from the frozen snapshot and stored ([receipts](finance-receipts-and-returns.md#donation-receipts-and-numbering)); `packages/jobs/src/lib/receipt-pdf.ts` maps the snapshot to props and serves the stored file. Amounts in words use lakh and crore. Deterministic bytes still matter before a receipt is stored: an email retry attaches the same file, and a store repairing a lost object must render the hash on record.

- At the input maximums it spills to a second page; notes and signature move together, and a voided receipt repeats a VOID marker on every page.
- A run over 40 characters with no spaces may break mid-word, and react-pdf draws a hyphen there.
- The verification QR sits left of the notes, so it adds no height. Its modules shrink as the link grows: the production link must stay at QR version 6 (about 0.5 mm modules), which a unit test holds.

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
