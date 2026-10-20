# Governance: resolutions

> **Load when**: circular resolution, resolution template, issue, response, objection, conflict of interest on a circular, signature check, resolution number, register change on pass, withdraw, past resolution, DSC signing helper, `pidash-sign://`, certificate enrolment, PAdES, long-term copies, re-timestamping.
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
- Resolutions decided at a board meeting share the numbering and register changes; see [meetings](governance-meetings.md).

## Signatures

- The register number isn't printed: the signatures fix the bytes before the number exists. A short circular reference is printed instead.
- The signing service adds every empty field in one incremental update, so each signature appends to the same file.
- A signed copy must be the latest PDF with exactly one more signature appended, intact, covering the whole file, in the trustee's own field when fields exist, and by that trustee by name (`matchSignerToTrustee`). Every earlier signature must still check out, so a copy another trustee's signature has moved past is refused as stale.
- Without the signing service, circulars are issued without fields and signed uploads are refused, because they can't be checked.
- The fully signed PDF goes into the vault as a resolution and is the evidence for the register entries it made. The R2 orphan cleanup keeps every circular PDF.

## Signing

Trustees sign with the DSC helper or in Acrobat, and every copy goes through the checks above.

- **DSC helper.** Browsers can't reach PKCS#11 tokens, so the signature is made outside the browser and joined back on the server:
  1. Enrolment, once per DSC: the helper reads the token's certificate (valid now, RSA), kept in the trustee's name. A renewed DSC is enrolled again.
  2. Signing needs a recent sign-in and an enrolled certificate. The signing service reserves the trustee's field and returns the attributes to sign, and the page opens a `pidash-sign://` link with a one-time job token (hashed at rest, 15 minutes).
  3. The helper fetches the job, asks for the PIN in its own window (never stored or sent), signs on the token and posts the signature back.
  4. The service checks the signature against the certificate and embeds it with a timestamp (PAdES B-T). The result must come from the enrolled certificate. The box shows the name large, then "Digitally signed by", the name and the date in India time, over a faint Proud Indian symbol. The job API has no session, so it is audited in the trustee's name.
- **Acrobat**: download the latest PDF, sign the box with the token in Acrobat or Reader, upload the saved copy.

The helper (`services/signing-helper`, Rust) signs only for the server its installer wrote into its config, so a crafted link can't make a token sign for another site. Installing and releasing it are in its README. The Windows binary is unsigned until SignPath signs it.

## Long-term copies

A passed circular's signed PDF gets a long-term copy at once (revocation data and a document timestamp, PAdES B-LTA), and downloads serve that copy. A monthly job adds a new document timestamp a year after the last; a failed one stays due.

Not built: certifying (DocMDP) first signatures. The first signature is an approval signature.
