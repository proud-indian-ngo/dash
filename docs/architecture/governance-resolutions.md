# Governance: resolutions

> **Load when**: circular resolution, resolution template, issue, response, objection, conflict of interest on a circular, signature check, resolution number, register change on pass, withdraw, past resolution.
> **Related**: `governance.md` (register, deed rules, vault, signing service)

## Lifecycle

| Step | Who | What happens |
|---|---|---|
| Draft | `governance.manage` | The text and the template's register change |
| Issue | The office-holder the deed allows (version 1: the MT) | Refused when the board is too small, the register change doesn't fit or the threshold is out of reach. Freezes revision 1 and renders the PDF with a signature field per trustee in office |
| Respond | Each trustee the circular went to | Sign, object with a reason, or declare a conflict, which leaves the count |
| Pass | | Signed assents reach the threshold |
| Fail | | Objections put the threshold out of reach, or the response date passes |
| Withdraw | The issuer, while issued | With a reason |

- Templates are code, not a table. They live in `packages/shared/src/resolutions.ts` with the tally, who may issue on a date, numbering and the signature-page layout, which the PDF and the signature fields both read so they line up.
- Passing takes the next number for the financial year under an advisory lock and makes the register change in the same transaction. A change the register can no longer take fails the resolution with the reason. Terms and offices keep the resolution that made them.
- A trustee sees the circulars sent to them without `governance.view`.
- Past paper resolutions are recorded with their numbers so the series continues.

## Signatures

- The register number isn't printed: the signatures fix the bytes before the number exists. A short circular reference is printed instead.
- The signing service adds every empty field in one incremental update, so each signature appends to the same file.
- A signed copy must be the latest PDF with exactly one more signature appended, intact, covering the whole file, in the trustee's own field when fields exist, and by that trustee by name (`matchSignerToTrustee`). Every earlier signature must still check out, so a copy another trustee's signature has moved past is refused as stale.
- Without the signing service, circulars are issued without fields and signed uploads are refused, because they can't be checked.
- The fully signed PDF goes into the vault as a resolution and is the evidence for the register entries it made. The R2 orphan cleanup keeps every circular PDF.

Trustees sign in Acrobat: download, sign the box with the DSC token, upload. The first signature is an approval signature, not a certifying one.
