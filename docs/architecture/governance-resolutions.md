# Governance: resolutions

> **Load when**: circular, circular resolution, resolution template, issue, response, objection, conflict of interest on a circular, signature check, resolution number, register change on pass, withdraw, past resolution, DSC signing helper, `pidash-sign://`, certificate enrolment, PAdES, long-term copies, re-timestamping.
> **Related**: `governance.md` (register, deed rules, vault, signing service)

## Lifecycle

| Step | Who | What happens |
|---|---|---|
| Draft | `governance.manage` | One resolution: the text and the template's register change |
| Issue | The office-holder the deed allows (version 1: the MT) | Picks up to ten drafts and their order into one circular. Refused when the board is too small, a register change doesn't fit the register as the drafts before it would leave it, or a threshold is out of reach. Freezes revision 1 and renders one PDF with every resolution and, per trustee in office, a signature field and an answers field |
| Respond | Each trustee the circular went to | Object to a resolution with a reason, or declare a conflict on it, which leaves its count. Then sign the circular once: the signature assents to every open resolution they haven't objected to or declared a conflict on. Ones decided before they sign are marked so, not assented to |
| Pass | | A resolution's signed assents reach its threshold |
| Fail | | Objections put a resolution's threshold out of reach, or the response date passes |
| Withdraw | The issuer, while any resolution is open | With a reason; resolutions already decided stay as they are |

- Each resolution in a circular passes or fails on its own. After every response, withdrawal or close, the open ones are settled in order under the circular's lock. One whose register change only fits once an earlier open resolution passes (a designation after the appointment) waits for it, and fails with the reason if that one fails.

- Templates are code, not a table. They live in `packages/shared/src/resolutions.ts` with the tally, who may issue on a date, numbering and the signature-page layout, which the PDF and the signature fields both read so they line up.
- Passing takes the next number for the financial year under an advisory lock and makes the register change in the same transaction. A change the register can no longer take fails the resolution with the reason. Terms and offices keep the resolution that made them.
- A trustee sees the circulars sent to them without `governance.view`.
- Past paper resolutions are recorded with their numbers so the series continues.
- Resolutions decided at a board meeting share the numbering and register changes; see [meetings](governance-meetings.md).

## Signatures

- Register numbers aren't printed: the signatures fix the bytes before the numbers exist. A short circular reference is printed instead.
- The signing service adds every empty field in one incremental update, so each signature appends to the same file. Each signature field locks its trustee's answers field (FieldMDP).
- Before a trustee signs, their answers ("Resolution 1: assents; Resolution 2: objects") are filled into their read-only answers field, and that copy is kept per latest PDF and set of answers. The fill is deterministic, so two requests for the same copy store the same bytes. The signature covers the answers, so the signed PDF records what each trustee assented and objected to. Changing an answer after starting means starting again.
- A signed copy must be that copy with exactly one more signature appended, intact, covering the whole file, not in another trustee's box, and by that trustee by name (`matchSignerToTrustee`). Every earlier signature and every answers field must be unchanged, and no earlier signature may report a change beyond form filling, so a copy another trustee's signature has moved past is refused as stale.
- Without the signing service, circulars are issued without fields and signed uploads are refused, because they can't be checked. A circular issued without fields has no answers boxes, so a signature on it reads as assent to everything: a trustee whose answers aren't all assents can't sign it.
- The signed PDF a resolution passed on goes into the vault and is the evidence for the register entries it made; resolutions that pass on the same signature share one document. Signed copies are stored by content, so a copy refused as stale never replaces an accepted one. The R2 orphan cleanup keeps every circular PDF, and an open circular's whole folder (signing copies, helper state) until it closes.

## Signing

Trustees sign with the DSC helper or in Acrobat, and every copy goes through the checks above.

- **DSC helper.** Browsers can't reach PKCS#11 tokens, so the signature is made outside the browser and joined back on the server:
  1. Enrolment, once per DSC: the helper reads the token's certificate (valid now, RSA), kept in the trustee's name. A renewed DSC is enrolled again.
  2. Signing needs a recent sign-in and an enrolled certificate. The signing service reserves the trustee's field and returns the attributes to sign, and the page opens a `pidash-sign://` link with a one-time job token (hashed at rest, 15 minutes).
  3. The helper fetches the job, asks for the PIN in its own window (never stored or sent), signs on the token and posts the signature back.
  4. The service checks the signature against the certificate and embeds it with a timestamp (PAdES B-T). The result must come from the enrolled certificate. The box shows the name large, then "Digitally signed by", the name and the date in India time, over a faint Proud Indian symbol. The job API has no session, so it is audited in the trustee's name.
- **Acrobat**: download the copy with the trustee's answers filled in, sign the box with the token in Acrobat or Reader, upload the saved copy.

Issuing notifies each trustee once per circular. The resolutions one response, withdrawal or close decides go out as one notice to the trustees and secretaries, with each outcome.

The helper (`services/signing-helper`, Rust) signs only for the server its installer wrote into its config, so a crafted link can't make a token sign for another site. Installing and releasing it are in its README. The Windows binary is unsigned until SignPath signs it.

## Long-term copies

A passed circular's signed PDF gets a long-term copy at once (revocation data and a document timestamp, PAdES B-LTA), and downloads serve that copy. A monthly job adds a new document timestamp a year after the last; a failed one stays due.

Not built: certifying (DocMDP) first signatures; the first signature is an approval signature. Not yet tried with real Acrobat files: that they carry the answers field's lock into the signature, and that they don't rewrite an existing field's appearance in place, which the validator now reads as a change to earlier signatures.
