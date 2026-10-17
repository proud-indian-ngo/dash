# Governance: resolutions

> **Load when**: circular resolution, resolution template, issue, response, objection, conflict of interest on a circular, signature check, resolution number, register change on pass, withdraw, past resolution, "Needs your vote or signature".
> **Related**: `governance.md` (register, deed rules, vault, signing service)

## Lifecycle

| Step | Who | What happens |
|---|---|---|
| Draft | `governance.manage` | Through Zero; title, text and the template's register change |
| Issue | The office-holder the deed allows (version 1: the MT) | Checks board size, the register change and that the threshold is reachable; freezes revision 1; renders the PDF; the signing service adds an empty signature field per trustee in office; opens a response for each; notifies them |
| Respond | Each trustee the circular went to | Sign the PDF, object with a reason, or declare a conflict, which leaves the count |
| Pass | | Signed assents reach the threshold |
| Fail | | Objections make the threshold unreachable, or the response date passes (`close-due-resolutions`, daily 00:30 IST) |
| Withdraw | The issuer, while issued | With a reason |

- Rules live in `packages/shared/src/resolutions.ts`: templates (code, not a table), the tally, who may issue on a date, numbers, and the signature-page layout that the PDF and the field positions share.
- Responding and signing are server functions that need a sign-in from the last 10 minutes; the page asks for the password again.
- Passing takes the next number for the financial year under an advisory lock and makes the register change (a term, its end, an office, a removal) in the same transaction. A change the register can no longer take fails the resolution with the reason. Terms and offices keep the resolution that made them.
- A trustee sees the circulars sent to them without `governance.view`; the dashboard card "Needs your vote or signature" lists the ones waiting.
- Notifications `notify-resolution-issued` and `notify-resolution-decided`, topic Governance.
- Past paper resolutions are recorded with their numbers so the series continues.

## Templates

Ordinary, appointment or co-option, cessation, office-bearer, bank operation, registered office, deed amendment (the deed's threshold), and removal under 7.12 (unanimity of the others, with the hearing recorded). The text is plain paragraphs.

## The PDF and signatures

- The PDF has the text page, then signature pages with one block per trustee. The signing service's `POST /prepare` adds the empty fields at the same coordinates in one incremental update. The register number isn't printed (the signatures fix the bytes); a short circular reference is.
- A signed copy must be the latest PDF with exactly one more signature appended, intact, covering the whole file, in the trustee's own field when fields exist, and by that trustee by name (`matchSignerToTrustee`). Every earlier signature must still check out. Another trustee's signature landing first refuses a stale copy.
- Without the signing service, circulars are issued without fields and signed uploads are refused, because they can't be checked.
- The fully signed PDF goes into the vault as a resolution and becomes the start or end evidence of the register entries it made. The R2 orphan cleanup keeps every circular PDF.

Signing in this phase is the Acrobat route: download, sign the box with the DSC token, upload. The first signature is an approval signature, not a certifying one.
