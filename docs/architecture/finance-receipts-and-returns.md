# Finance: receipts and the donations return

Donation receipts and their numbering, and the donations return (Form 113/114): readiness, filings, and Form 114 certificates.

Donor records in [finance-income.md](finance-income.md); overview in [finance-and-programmes.md](finance-and-programmes.md).

## Donation receipts and numbering

Rules start in `packages/shared/src/receipts.ts`.

- Policy (founder decision): Razorpay and give.do send their own 80G receipts (give.do under the trust's registration), so the dashboard receipts only direct gifts (UPI, NEFT, cheque, cash) received from 1 April 2026. In-kind gifts are not receipted.
- One live receipt per gift. A server-only snapshot freezes what the PDF prints, so later edits never change an issued receipt.
- Numbering (`PI/2026-27/0001`): one gap-free series per financial year of the issue date, from a locked counter row in the issuing transaction, so a rollback gives the number back; a Postgres `SEQUENCE` would skip. Voiding keeps the number.
- Eligibility: direct gift on or after the start, `received`, no refund, INR, not a platform donor, donor with name and address with PIN. The 80G line (needing a valid ID, printed in full) is left out when the gift is excluded, the donor opted out, or cash is above ₹2,000; the receipt then says no deduction certificate is issued. The trust's particulars and 80G registration must be set first.
- New direct gifts entered manually, from a bank line or by CSV queue automatic issuing in the donation transaction. The worker checks eligibility and reads the signature before allocating a number, then atomically queues PDF storage now and delivery for later (see [Delivery](#delivery)). Missing settings or donor details leave the gift unreceipted in the existing readiness queue for finance. Existing gifts aren't backfilled automatically.
- `donors.receipt` (finance admins and super admins) still manually issues, voids with a reason and sends. Issuing sets the gift `receipted`; voiding returns it to `received`. Automatic jobs never replace a receipt, including a voided one. Reading also needs an income permission. Every authenticated PDF fetch, including the viewer, is audited as a download because it carries the full ID.
- The PDF is rendered once after issue, stored in R2 with its SHA-256 and served from then on, so later template changes never alter an issued receipt. Each render goes to its own random key, and the first one recorded wins, so racing stores (the issue job and a download, perhaps on different builds) all serve one file; every serve checks the hash, and a missing object is put back only if a fresh render matches it. Receipts issued before storing are fixed at their first fetch after it, in the template of that day; the facts are the same. A voided receipt is rendered afresh with the VOID marker; the stored original stays.
- Stored PDFs are plain, like every other R2 file, and carry the donor's full ID: their keys are random, never derived from the receipt ID the QR prints or the hash the page shows, and the bucket must not be publicly readable ([Private media cutover](../../DEPLOYMENT.md#private-media-cutover)).
- The signatory's signature prints above their name. Finance uploads a photo or scan in Settings; the browser makes the paper transparent and fits it to the payee-signature PNG limits, which the server checks on claim. Only `appConfig.saveReceiptSettings` writes the receipt settings, because it alone sets the signature key, from an upload it claims. Issuing refuses when the signature can't be read, since a number can't be given back. Each receipt freezes the key at issue, so a replaced signature never changes issued receipts, and R2 cleanup counts both. Receipts issued before signatures print the name alone. No rule found requires a signature on the trust's own receipt (CA to confirm); it is there because donors and reviewers expect one, and proves nothing on its own.
- Every receipt carries a QR code that opens a public page saying whether Proud Indian issued it and whether it was voided. The page shows what a forger would change (amount, mode, the 80G line, the trust's PAN and URN) and the donor only as initials, never the ID or address, so a leaked link shows little. Refunds aren't shown: only gateway gifts are refunded, and those are never receipted here.
- The link is an HMAC of the receipt ID under a key derived from `DATA_ENCRYPTION_KEY`, on the `APP_URL` origin. Both are printed on paper for good: the key never changes, and the origin must keep serving or redirecting `/verify/r/*`. A bad signature reads as an unknown receipt. For a valid receipt the page also checks a PDF copy against the stored hash in the browser, so the file never leaves the device; any re-save fails it, so it reports a different file, not a forgery. A cancelled receipt offers no check: it isn't valid whatever file you hold. The PDF is not digitally signed: a printed copy loses the signature and a self-signed one shows as untrusted, while the QR survives printing.
- Receipts have no ledger effect.

### Delivery

Code: `packages/jobs/src/handlers/deliver-contribution-receipt.ts` and `send-contribution-receipt*.ts`, `apps/web/src/lib/receipts/server.ts`.

- Founder decision: issue now, send later. An automatic receipt is numbered and its PDF stored at once, so finance can check it, but goes to the donor only after a cooling-off window (`RECEIPT_AUTO_SEND_DELAY_MS`, one hour, in `packages/shared/src/receipts.ts`). The receipt records when (`autoSendAt`), and one `deliver-contribution-receipt` job is queued in the issuing transaction with pg-boss `startAfter` at that time. Receipts issued by hand never send on their own.
- That job reads the donor's contacts once and applies the automatic rule: email when the donor has an address, otherwise WhatsApp, without needing a dashboard account. A suppressed address, an email failure or missing email setup doesn't fall back to WhatsApp. It skips a voided receipt and one already emailed or sent on WhatsApp.
- Before the window ends finance can void the receipt (every job checks) or "Send now", which moves `autoSendAt` from its future value to now (refused otherwise, so a second click or tab does nothing) and queues the same job at once. The delayed copy then skips if Send now delivered; both copies use the same email and WhatsApp idempotency keys, so overlapping copies can't deliver twice. If Send now's email didn't go, the delayed copy tries again; a WhatsApp attempt Meta refused isn't retried under that key, so finance uses "Send on WhatsApp".
- Finance can also email or send on WhatsApp any live receipt at any time, each channel separately; WhatsApp goes even when the donor has an email address. These sends never touch the automatic send: if one goes, the automatic job later finds the receipt delivered; if it fails, the automatic send still goes at the window. A click within seconds of the automatic send can deliver twice. They queue under a new request each and are refused only for a voided receipt, a missing address or phone, or a changed donor. All three are `donors.receipt` server functions, audited by receipt ID (`contribution_receipt.email`, `.whatsapp`, `.send_now`). The Receipts tab learns which donors can be emailed or messaged from a flags-only read, and disables what can't work with the reason.
- A receipt goes only to the donor it was issued to. The snapshot freezes that party, a gift with a live receipt can't change its donor or anything else the receipt printed or decided (amount, date, channel, mode of receipt, donation type, reference, programme, project, tax certificate choice; void it first), and every send refuses and records "donor changed" if the gift's donor still differs.
- Each send records its outcome on the receipt: `emailedAt` or `whatsappSentAt` when it goes, otherwise `deliveryFailure` (donor changed, no contact, no phone, suppressed or unconfigured email, no WhatsApp template, unconfigured or refused WhatsApp, a thrown send). A send that goes clears the failure. The Receipts table and sheet show, in order: "Emailed on …" or "Sent on WhatsApp on …"; "Sends automatically on …" before the window ends; then "Not sent: …" if a failure is recorded, "Sending" for up to 30 minutes (`RECEIPT_AUTO_SEND_GRACE_MS`) after the automatic send's time, or "Not sent". A failure behind a sent or scheduled state shows as a "Last send failed" note. Jobs retry thrown sends under stable per-request keys; a WhatsApp retry whose earlier attempt Meta accepted counts as sent.
- WhatsApp attaches the stored PDF through the `donation_receipt` document template on the Cloud API, or directly through GoWA when Cloud is off. Until Meta approves the template, a Cloud send stops before uploading the PDF and reports "Not sent: the WhatsApp receipt template isn't approved yet". Template submission needs a synthetic PDF's resumable-upload handle (`--document-header-handle`), distinct from a runtime media ID.

## Donations return (Form 113/114)

Form 113 (Income-tax Act 2025, formerly Form 10BD) is due by 31 May 2027 for FY 2026-27; Form 114 certificates (formerly 10BE) are generated by the portal afterwards. Gifts before 1 April 2026 were filed outside the dashboard. Rules, codes and columns live in one module, `packages/shared/src/donations-return.ts`, used by the readiness page, the "Missing donor details" stat and the export.

### Inclusion rules

Every received gift of the year is a candidate, any channel (give.do gifts go in under each real donor). In order:

- Waiting: status `pending`.
- Excluded: reversed, fully refunded, foreign currency, in kind (CA to confirm), cash above ₹2,000 per donation, marked Exclude, or from an opted-out donor (gift on Follow donor). In kind and cash are judged by channel as well as mode.
- In the return, ready unless blocked by: a platform such as GiveIndia recorded as donor, or a donor without a name, an address (line 1 and PIN code), or a valid ID (PAN shape, or 5–20 alphanumerics for other documents; undecryptable counts as invalid).
- A partly refunded gift is reported at its net amount (CA to confirm).

### Readiness page and export

- The readiness page lists what blocks filing, including CSR gifts for the CA to decide, and which gifts are filed. Without `DATA_ENCRYPTION_KEY` IDs are unchecked and no filing can be recorded.
- The CA's file of every gift (status and reason, ID masked) needs `finance.view_sensitive` and is audited because it reveals identifiers in bulk. The portal upload file comes only from recording a filing, so every uploaded row is tracked.
- Upload rows: one per donor, donation type and mode, each cash gift its own row; ready gifts only; net amounts in rupees. Codes are written as full text. Voluntary and CSR map to "Specific grant", matching the FY 2025-26 filing. The official Form 113 template could not be verified, so columns follow the FY 2025-26 Form 10BD; check against the portal before each upload.
- The 80G registration (URN, date, section code) is entered in Settings, never seeded. No filing is recorded until it is set.

### Filings (Form 113)

Code: `packages/db/src/queries/donation-filings.ts`, `apps/web/src/lib/donation-filings/`. Tables are in the `private` schema and read through server functions.

- "Record filing" (`finance.manage` and `finance.view_sensitive`, because it hands back full IDs) freezes the ready gifts not already filed into the year's next filing: `donation_filing`, its `donation_filing_row`s (the donor's name, address, ID type and code, amount, type and mode as written, ID encrypted under the row) and `donation_filing_gift` linking each gift to its row with its net amount as filed. The exact upload file is kept in private R2 storage, and the stored rows are exactly what it holds. One filing per year is recorded at a time, and the gift is the link's key, so no gift is ever in two live filings, of any year. A later filing holds only gifts not yet filed.
- The required Pre-Acknowledgement Number column is always empty.
- After uploading the file, finance records the filing date, acknowledgement number and transaction ID (correctable later). A submission can be taken back to prepared while no certificate is attached. A filing never submitted can be discarded, which frees its gifts; its filing number stays used.
- Filed rows never change. A filed gift's amount, donor, date, channel, mode of receipt, donation type and tax certificate choice can't be edited, and it can't be deleted; while its filing isn't uploaded yet, the message says to discard the filing instead. Refunds and reversals still happen; each filing lists the rows whose gifts changed since filing (net amount after refunds, reversal, Exclude, donor, donation type) as needing a portal revision, and the filings list counts them. Revisions (modify or delete rows, quoting the certificate number) are not built.
- The readiness page counts filed gifts at the amounts they were filed at.
- Downloading the upload file needs `finance.view_sensitive` and is audited as `donation_filing.download`.

### Form 114 certificates

- Finance uploads the portal's ZIP (or single PDFs) against a submitted filing. Each PDF's text is read and matched to a row:
  - By the labelled donor ID (at least eight characters, never part of another number), amount and donor name. Labelled donation type and mode break ties. Finance can bulk-confirm unique PAN matches; other ID types and manual assignments need individual PDF review. Both confirmation paths require `finance.manage` and `finance.view_sensitive`, record who confirmed and when, and leave emailing separate. No certificate is emailed until confirmed.
  - By hand: for a certificate matching couldn't place (two cash rows of one donor and amount), finance adds that PDF on the row. It goes to review too.
- A certificate carrying another filing's certificate number, or a labelled tax year other than the filing's, is refused. Rows are inserted before any file is written to R2, and files written are deleted if the insert fails.
- Matched certificates are stored as `donation_certificate` (the row, the certificate's own labelled acknowledgement number (required even for manual assignment), the PDF in private R2, how it matched, who confirmed it). Unmatched files are listed with the reason and not kept; a row takes one certificate, and a re-uploaded file is recognised.
- Unverified assumptions, all in `certificate-parser.ts`: a certificate prints its own number (with a digit) after an "Acknowledgement Number" label, the donor's ID after "Unique Identification Number", the amount after a label starting "Amount", and the donor's name after its label, as extractable text. ZIP file names are never used.
- "Email certificates" (`finance.manage`) queues one `send-donation-certificate` job per confirmed certificate not yet emailed or on its way, in the claim's transaction. A failed send is taken again under a new request; one queued over an hour ago with no outcome (shown as stuck) is queued again under its own request, so Resend's idempotency key keeps it from going twice; only an explicit resend repeats a sent one, and a row offers it only while nothing is on its way. The job sends only while the certificate carries its request, under a Resend idempotency key, so a certificate is never emailed twice by accident. It goes to the donor's current address with the PDF attached. The send time is recorded only when Resend accepts it; "another request with this key is in progress" is retried, a key reused for another payload is recorded as failed, and other failures are recorded and retried. Donors without a usable address (none, or bounced) are listed for sending by hand. Certificates are due to donors by 31 May.
- Viewing or downloading a certificate needs `finance.view_sensitive` and is audited as `donation_certificate.download`.

### Verify on the portal before relying on it

- The Form 113 template: columns, order and code lists in `donations-return.ts`, including the ID codes (`RETURN_ID_CODES`).
- The certificate layout the parser assumes, including its labelled acknowledgement number and donor details.
