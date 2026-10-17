# Governance

> **Load when**: trustee register, offices and terms, deed versions, governance documents vault, organisation registrations, signing service (pyHanko), circular resolutions, meetings, DSC, Aadhaar eSign, compliance calendar, conflict of interest, policy register, safeguarding.
> **Related**: `authorization.md`, `file-uploads.md`, `notifications.md`, `jobs.md`, `finance-and-programmes.md`

## Goals

Proud Indian is a public charitable trust under deed Doc. No. 864, Book IV, 2018-19, registered at the Shivajinagar (Indiranagar) Sub-Registrar on 16-03-2019. Bengaluru has no Charity Commissioner, so the deed alone governs Board decisions. Board records lived in Word files, emails and scans, and the 07-12-2025 resolution claimed a quorum it did not have.

The aim is one place that holds the trustee register and the trust's deeds and registrations, runs circulars and meetings by the deed's rules, gets decisions signed by DSC or Aadhaar eSign, and drives a compliance calendar with evidence.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Voters | Only trustees with a current term. A trustee may link to a user account | The deed counts trustees in office |
| Permissions | `governance.view`; `governance.manage` (the secretary runs the process); `governance.kyc.view` (reveal PAN and Aadhaar, audited). No new role | Duties sit on top of existing roles |
| Deed rules | Dated deed versions; each decision is checked against the version in force on its date | Amendments must not rewrite history |
| Pass rule | Majority of trustees in office at issue; two-thirds for an amendment, unanimity of the others for removal | Clauses 4.18, 9.3, 7.12 |
| Numbering | Per financial year, assigned on pass: `PI/TR/2026-27/NNN` | Continues the paper series |
| Immutability | Decided resolutions never change; a new one amends or rescinds. An issued circular is withdrawn and reissued | Signatures cover a fixed revision |
| Signing | DSC through a local helper; Acrobat download and upload; Leegality Aadhaar eSign. A pyHanko sidecar checks every signature | Every trustee has a HyperSecu HYP2003 on Windows or Mac |
| Vote confirmation | Signing or objecting needs a sign-in within 10 minutes | Shared laptops must not vote |
| Finance | No trustee tier in approvals. A payment to a trustee that isn't a reimbursement warns | Clause 7.24 |

## Deed rules (version 1)

| Clause | Rule | Enforcement |
|---|---|---|
| 4.4, 4.5 | Co-Founders who are Managing (MT) or Joint Managing Trustee (JMT) serve for life; others 3 years unless reappointed; MT and JMT together may co-opt for up to 3 years | Term end dates and bases |
| 4.12, 4.14 | 2 to 9 trustees; below 2 only vacancies may be filled | Register warnings |
| 4.15, 5.3 | Quorum 5 present and voting including the MT; conflicted trustees neither vote nor count | Quorum warning; per item at meetings |
| 4.16, 4.19 | Officers: President (chairs), Vice President, Secretary, Treasurer; 7 days' notice with agenda | Notice check |
| 4.17 | Simple majority; Chairman's casting vote | Casting vote for the chair |
| 4.18 | Circular issued by the MT to all, signed by a majority, noted at the next meeting | Issue restricted to the MT |
| 4.20, 4.22, 4.23 | Absentee written views count; the chair signs minutes; absence without leave ends a term | Meetings |
| 4.24 | New trustees accept in writing | Acceptance document on the term |
| 7.12 | Removal by unanimous vote of the others after a hearing, reasons in writing | Removal template |
| 7.24 | No remuneration, only expenses | Finance warning |
| 9.3 | Amendment by two-thirds with the Income-tax Commissioner's prior approval | Template threshold |

The pending amendment sets quorum to half the trustees in office with a floor of two, lets the JMT issue circulars when the MT cannot, allows email circulation and e-signatures, and counts video attendance. It becomes version 2 when the registered deed is uploaded.

## Trustee register

- PAN, Aadhaar and contact details live in the `private` schema, so Zero never syncs them, and change only through `saveTrusteeFn`. Revealing the full PAN or Aadhaar reference needs `governance.kyc.view` and is audited, like `party.identifier.reveal`.
- Who held which term and office on a date (`boardOn`), the warnings and the quorum live in `packages/shared/src/governance.ts`, so the pages, the mutators and the reminder job agree.
- A term's `ends_on` is its last day (inclusive); `ended_on` on a term or office is the first day out. An office with no end of its own ends with its holder's term.
- Co-Founder is a flag on the trustee, not an office.
- Every date carries its evidence: start and end documents on terms and offices, and the acceptance on a term. "Unevidenced" is derived from a missing document, never stored.
- Mutators refuse a change that gives an office two holders, puts an office outside its holder's term, or overlaps a trustee's terms. Problems the register already holds (board size, an unreachable quorum, a vacant MT or President, unevidenced dates) show as warnings instead, since the history has them.

## Deed versions

Version 1 has a fixed ID and is ensured on every server start. A version applies to decisions on or after its effective date. `quorum_value` is a head count for `fixed` quorum and a percentage of trustees in office for `fraction`. The registered deed or deed of amendment in the vault links to its version.

## Vault and registrations

- Every upload is checked before it's kept: its real type, a duplicate by SHA-256, and its signatures, which are matched to trustees in the register. An email (`.eml`) is read for its headers only, never its body.
- Downloads need `governance.view`, or `finance.view` for registration certificates. The R2 orphan cleanup keeps every key the vault references.
- A registration (12AB, 80G and others) keeps its certificate as a vault document.

## Signing service

`services/signing` is an internal pyHanko service with no public route; the web app calls it with a bearer token. It reports certificate facts and pyHanko's verdicts, never document text, and trusts the roots in `services/signing/roots/`. Without it, uploads are stored unchecked and can be checked later.

## Not built yet

### Circulars

- Drafted by `governance.manage` and issued by the MT: a frozen revision rendered as a PDF and sent to the trustees in office.
- An assent is a signature on the PDF; an objection is a click with a reason; a conflicted trustee leaves the count.
- A circular passes when signed assents reach the threshold, taking its number and making its register change in the same transaction. It fails when the response date passes or objections make the threshold unreachable. The issuer may withdraw it.

### Signing

Browsers can't reach PKCS#11 tokens, so signing is deferred: the sidecar prepares an empty field, a local Rust helper opened by a `pidash-sign://` link signs on the token (PIN in its own window, never stored), and the sidecar embeds the signature with a DigiCert timestamp (PAdES B-T). Final documents get revocation data and a document timestamp (B-LTA), renewed yearly. Fallbacks: Acrobat download and upload, and Leegality Aadhaar eSign (about ₹25 per signature; Leegality sees the full PDF).

### Meetings

Notice by the deed's days; quorum and result per agenda item, by the deed in force that day; absentee written votes count toward the result, not quorum; the chair's casting vote; minutes signed by the chair; circulars since the last meeting noted.

### Compliance, declarations and policies

- A calendar of filings and renewals with reminders; items close only with evidence.
- Yearly conflict-of-interest declarations that feed the finance warning; a policy register whose child-safeguarding policy gates events with children; annual-approval templates opened from calendar items; CSR utilisation certificates after finance Phase 5.

## Board at design time

After circular PI/TR/2026-27/001 (ink-signed 18 October 2026):

| Trustee | Offices | Term |
|---|---|---|
| Sarjun H Hajathulla | Co-Founder; MT from 04-04-2026 | Life (4.4) |
| Somasundaram Ayyappan | Secretary from 07-12-2025; JMT from 18-10-2026 | 07-12-2025 to 06-12-2028 (co-option, 4.5) |

- Former: Chenthil Kumar S (Co-Founder, MT; resigned 04-04-2026 by DSC-signed letter), Sameedha Vinaykumar Salvi (Vice President; resigned 16-10-2026 by email), Swathipriya S (16-10-2025), Gagandeep Singh (13-10-2025), Anitha Samraj Chandrasekaran (17-11-2025; start unevidenced).
- President, Vice President and Treasurer are vacant: no casting vote until a President is elected.

The seeds hold a fictional board of the same shape (Asha Rao, Vikram Menon, Meera Iyer, Rahul Das), shared by the dev and E2E seeds.

## Open questions

1. Does Adobe Reader trust Leegality eSign without setup? (It trusts the DSCs.)
2. Ink-signed circulars after go-live: historical imports, or a first-class method with scan upload?
3. Version 2 values await counsel's final amendment wording.
4. Windows PKCS#11 path for the HyperSecu driver, to read from a trustee's laptop.
