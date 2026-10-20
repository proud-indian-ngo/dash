# Governance: resolutions

> **Load when**: circular, circular resolution, resolution template, issue, response, objection, conflict of interest on a circular, signature check, resolution number, register change on pass, withdraw, past resolution, DSC signing helper, `pidash-sign://`, certificate enrolment, PAdES, long-term copies, re-timestamping.
> **Related**: `governance.md` (register, deed rules, vault, signing service)

## Lifecycle

| Step | Who | What happens |
|---|---|---|
| Draft | `governance.manage` | One resolution: the text and the template's register change |
| Issue | The office-holder the deed allows (version 1: the MT) | Picks up to ten drafts and their order into one circular. Refused when the board is too small, a register change doesn't fit the register as the drafts before it would leave it, or a threshold is out of reach. Freezes revision 1 and renders one PDF with every resolution and, per trustee in office, a signature field and an answers field. The register is read again as the circular is saved; if the issuer's authority, the trustees in office or a threshold changed meanwhile, it is refused for a fresh issue |
| Respond | Each trustee the circular went to | Object to a resolution with a reason, or declare a conflict on it, which leaves its count. Then sign the circular once: the signature assents to every open resolution they haven't objected to or declared a conflict on. Ones decided before they sign are marked so, not assented to |
| Pass | | A resolution's signed assents reach its threshold |
| Fail | | Objections put a resolution's threshold out of reach, or the response date passes. Responses are taken through that day and refused after it |
| Withdraw | The issuer, while any resolution is open | With a reason; resolutions already decided stay as they are |

- Each resolution in a circular passes or fails on its own. After every response, withdrawal or close, the open ones are settled in order under the circular's lock. One whose register change only fits once an earlier open resolution passes (a designation after the appointment) waits for it, and fails with the reason if that one fails.

- Templates are code, not a table. They live in `packages/shared/src/resolutions.ts` with the tally, who may issue on a date, numbering and the signature-page layout, which the PDF and the signature fields both read so they line up.
- Passing takes the register lock, then the next number for the financial year under an advisory lock, and makes the register change in the same transaction. A cessation ends the trustee's latest open term begun before its date and the offices they still hold that day; a designation ends the office's holder on its start day. An office that already ended with its holder's term is left alone. A change the register can no longer take fails the resolution with the reason. Terms and offices keep the resolution that made them.
- A trustee sees the circulars sent to them without `governance.view`.
- Past paper resolutions are recorded with their numbers so the series continues.
- Resolutions decided at a board meeting share the numbering and register changes; see [meetings](governance-meetings.md).

## Signatures

- Register numbers aren't printed: the signatures fix the bytes before the numbers exist. A short circular reference is printed instead.
- The signing service adds every empty field in one incremental update, so each signature appends to the same file. Each signature field locks its trustee's answers field (FieldMDP).
- Before a trustee signs, their answers ("Resolution 1: assents; Resolution 2: objects") are filled into their read-only answers field, and that copy is kept per latest PDF and set of answers. The fill is deterministic, so two requests for the same copy store the same bytes. The signature covers the answers, so the signed PDF records what each trustee assented and objected to. Changing an answer after starting means starting again.
- A signed copy must be that copy with exactly one more signature appended, intact, covering the whole file, and by that trustee by name (`matchSignerToTrustee`). It may not be a certification (DocMDP) signature, and may lock (FieldMDP) only that trustee's own fields, since either would make the later trustees' signatures fail. The helper and Acrobat sign the trustee's own box. Only on a circular issued without fields may a signature sit in a field of its own, and its widget must sit on the last page, at most one and a half times a box, over no other field. Every earlier signature and every answers field must be unchanged, and no earlier signature may report a change beyond form filling, so a copy another trustee's signature has moved past is refused as stale. pyHanko judges only changes after a signature, so the validator also reviews everything appended to the copy the trustee was given: anything beyond form filling (signing a field, or adding a signature field) is refused, and so is any change to how an existing widget renders (its place, appearance, flags, look or read-only flag) other than the new signature's value and appearance, or a new field left unsigned, which pyHanko counts as form filling.
- The new signature's certificate must chain to a root in `services/signing/roots/` (the CCA India roots), and so must a certificate at enrolment; a system root doesn't count. Every earlier signature must still pass that check, or the upload is refused and the trustee is asked to tell the Managing Trustee. pyHanko checks a certificate as of now, so one with a trusted timestamp that fails now is checked again as of the timestamp, with revocation data issued since and whatever the first check found: revoked after it was made, it still counts. Revocation is soft-fail: a certificate is refused only when known revoked, and OCSP and CRL data are fetched only with `SIGNING_ALLOW_FETCHING=true`.
- Without the signing service, circulars are issued without fields and signed uploads are refused, because they can't be checked. A circular issued without fields has no answers boxes, so a signature on it reads as assent to everything: a trustee whose answers aren't all assents can't sign it.
- The signed PDF a resolution passed on goes into the vault and is the evidence for the register entries it made. Terms and offices record the resolution that started them and the one that ended them (a cessation, a removal, or a designation replacing the holder) separately, so filing either one later, in any order, fills the right date's evidence; resolutions that pass on the same signed PDF share one document, filed once by its hash even when concurrent responses pass them. One passed by an objection or a declared conflict files the circular's latest signed PDF. Signed copies are stored by content, so a copy refused as stale never replaces an accepted one. The R2 orphan cleanup keeps every circular PDF, and an open circular's whole folder (signing copies, helper state) until it closes.

## Signing

Trustees sign with the DSC helper or in Acrobat, and every copy goes through the checks above.

- **DSC helper.** Browsers can't reach PKCS#11 tokens, so the signature is made outside the browser and joined back on the server:
  1. Enrolment, once per DSC: the helper reads the token's certificates and keeps the first in the trustee's name that is valid now, RSA, chains to a CCA root and has the key usage pyHanko requires of a signer (non-repudiation), so the token's encryption certificate is passed over. A renewed DSC is enrolled again.
  2. Signing needs a recent sign-in and an enrolled certificate. The signing service reserves the trustee's field and returns the attributes to sign, and the page opens a `pidash-sign://` link with a one-time job token (hashed at rest, 15 minutes).
  3. The helper fetches the job, asks for the PIN in its own window (never stored or sent), signs on the token and posts the signature back. When it gives up on the trustee's computer (PIN cancelled, no token, wrong token), it posts the reason instead, which closes the job, so the page stops waiting and shows why.
  4. The service checks the signature against the certificate and embeds it with a timestamp (PAdES B-T). The result must come from the enrolled certificate. The box shows the name large, then "Digitally signed by", the name and the date in India time, over a faint Proud Indian symbol. The job API has no session, so it is audited in the trustee's name. Its body is read up to 272 KiB.
- **Acrobat**: download the copy with the trustee's answers filled in, sign the box with the token in Acrobat or Reader, upload the saved copy.

A helper job is completed one caller at a time: the first claims the pending row (its `completedAt`, committed before the work and lapsing after five minutes), and a second post returns how the first settled it, or a 409 while it's still running. Only the claim's holder settles the row, so a caller whose claim lapsed and was taken over returns how the row settled. A caller that finds the trustee's signature recorded since the job began (by one whose claim lapsed) settles it as signed. A settled one is never changed.

Issuing notifies each trustee once per circular. The resolutions one response, withdrawal or close decides go out as one notice to the trustees and secretaries, with each outcome, through the `notify-resolution-decided` job, so a failed delivery is retried. The closing job queues its notice in the transaction that decides the circular, so a failed enqueue leaves the circular open for the next run.

The helper (`services/signing-helper`, Rust) signs only for the server its installer wrote into its config, so a crafted link can't make a token sign for another site. Installing and releasing it are in its README. The Windows binary is unsigned until SignPath signs it.

## Long-term copies

A passed circular's signed PDF gets a long-term copy at once (revocation data and a document timestamp, PAdES B-LTA), and downloads serve that copy. A monthly job adds a new document timestamp a year after the last; a failed one stays due.

Not built: certifying (DocMDP) first signatures; the first signature is an approval signature. Not yet tried with real Acrobat files: that they carry the answers field's lock into the signature, and that they don't rewrite an existing field's appearance in place, which the validator now reads as a change to earlier signatures.
