# Governance

> **Load when**: trustee register, offices and terms, deed versions, governance documents vault, organisation registrations, signing service (pyHanko), circular resolutions, meetings, DSC, compliance calendar, conflict of interest, policy register, safeguarding.
> **Related**: `authorization.md`, `file-uploads.md`, `notifications.md`, `jobs.md`, `finance-and-programmes.md`

## Goals

Proud Indian is a public charitable trust under deed Doc. No. 864, Book IV, 2018-19, registered at the Shivajinagar (Indiranagar) Sub-Registrar on 16-03-2019. Bengaluru has no Charity Commissioner, so the deed alone governs Board decisions. Board records lived in Word files, emails and scans, and the 07-12-2025 resolution claimed a quorum it did not have.

The aim is one place that holds the trustee register and the trust's deeds and registrations, runs circulars and meetings by the deed's rules, gets decisions signed by DSC, and drives a compliance calendar with evidence.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Voters | Only trustees with a current term. A trustee may link to a user account | The deed counts trustees in office |
| Permissions | `governance.view`; `governance.manage` (the secretary runs the process); `governance.kyc.view` (reveal PAN and Aadhaar, audited). No new role | Duties sit on top of existing roles |
| Deed rules | Dated deed versions; each decision is checked against the version in force on its date | Amendments must not rewrite history |
| Pass rule | Majority of trustees in office at issue; two-thirds for an amendment, unanimity of the others for removal | Clauses 4.18, 9.3, 7.12 |
| Numbering | Per financial year, assigned on pass: `PI/TR/2026-27/NNN` | Continues the paper series |
| Immutability | Decided resolutions never change; a new one amends or rescinds. An issued circular is withdrawn and reissued | Signatures cover a fixed revision |
| Signing | DSC through a local helper; Acrobat download and upload. A pyHanko sidecar checks every signature | Every trustee has a HyperSecu HYP2003 on Windows or Mac |
| Vote confirmation | Signing or objecting needs a sign-in within 10 minutes | Shared laptops must not vote |
| Finance | No trustee tier in approvals. A payment to a trustee or a declared related party warns ([declarations](governance-compliance.md#declarations-of-interests)) | Clause 7.24 |

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

- PAN, Aadhaar and contact details live in the `private` schema, so Zero never syncs them, are read with `governance.manage` and change only through `saveTrusteeFn`. The account picker shows emails only with `users.view`. Revealing the full PAN or Aadhaar reference needs `governance.kyc.view` and is audited, like `party.identifier.reveal`.
- Who held which term and office on a date (`boardOn`), the warnings and the quorum live in `packages/shared/src/governance.ts`, so the pages, the mutators and the reminder job agree.
- A term's `ends_on` is its last day (inclusive); `ended_on` on a term or office is the first day out. An office with no end of its own ends with its holder's term.
- Co-Founder is a flag on the trustee, not an office.
- Every date carries its evidence: start and end documents on terms and offices, and the acceptance on a term. "Unevidenced" is derived from a missing document, never stored.
- Mutators refuse a change that gives an office two holders, puts an office outside its holder's term, or overlaps a trustee's terms. Every such write, and every register change on pass, takes one register-wide advisory lock before reading the register, so concurrent changes are checked in turn. Problems the register already holds (board size, an unreachable quorum, a vacant MT or President, unevidenced dates) show as warnings instead, since the history has them.

## Deed versions

Version 1 has a fixed ID and is ensured on every server start. A version applies to decisions on or after its effective date. `quorum_value` is a head count for `fixed` quorum and a percentage of trustees in office for `fraction`. The registered deed or deed of amendment in the vault links to its version. A registered amendment becomes the next version, starting from the rules of the one before, and must take effect after it.

## Vault and registrations

- Every upload is checked before it's kept: its real type, a duplicate by SHA-256 (unique, so a simultaneous identical upload is refused too), and its signatures, which are matched to trustees in the register. An email (`.eml`) is read for its headers only, never its body.
- Downloads need `governance.view`, or `finance.view` or `finance.manage` for registration certificates, matching the Registrations page. The R2 orphan cleanup keeps every key the vault references.
- A registration (12AB, 80G and others) keeps its certificate as a vault document.

## Signing service

`services/signing` is an internal pyHanko service with no public route; the web app calls it with a bearer token. It reports certificate facts, pyHanko's verdicts and text-field values (a circular's answers), never document text, and trusts the system roots (for timestamps) plus `services/signing/roots/`, the only roots a signer may chain to. `services/signing/intermediates/` holds CA certificates that complete a chain a PDF leaves out (the eMudhra CAs behind Income Tax Department orders); they are never roots. An RSA signature whose DigestInfo omits the hash's NULL parameters, as the department's do, is accepted only in that one exact encoding. It also prepares, fills answers into, signs and finalises circulars ([resolutions](governance-resolutions.md#signing)). Its validator uses pyHanko's default diff policy, except that a field's appearance may not be rewritten in place: pyHanko otherwise reads every later answers fill as a change to the locked field. Without it, uploads are stored unchecked and can be checked later.

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

1. Ink-signed circulars after go-live: historical imports, or a first-class method with scan upload?
2. Version 2 values await counsel's final amendment wording.
3. Windows PKCS#11 path for the HyperSecu driver, to read from a trustee's laptop.
