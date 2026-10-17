# Governance (design)

> **Status**: design agreed 17 October 2026; nothing built yet.
> **Load when**: trustee register, offices and terms, deed versions, circular resolutions, meetings, quorum, minutes, DSC (HYP2003, PKCS#11), signing helper, pyHanko sidecar, Aadhaar eSign (Leegality), governance documents vault, compliance calendar, conflict of interest, policy register, safeguarding, CSR utilisation certificates, annual approvals pack.
> **Related**: `finance-and-programmes.md`, `authorization.md`, `file-uploads.md`, `pdf.md`, `editor.md`, `notifications.md`, `jobs.md`

## Goals

Proud Indian is a public charitable trust under deed Doc. No. 864, Book IV, 2018-19, registered at the Shivajinagar (Indiranagar) Sub-Registrar on 16-03-2019. Bengaluru has no Charity Commissioner, so the deed alone governs Board decisions. Board records have lived in Word files, emails and scans, and the 07-12-2025 resolution claimed a quorum it did not have.

The dashboard will hold the trustee register, run circulars and meetings by the deed's rules, get decisions signed by DSC or Aadhaar eSign, keep the trust's registrations and deeds, and drive a compliance calendar with evidence.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Voters | Only trustees with a current term. Each register entry links to a user account | The deed counts trustees in office |
| Permissions | `governance.view`; `governance.manage` (secretary or admin runs the process); `governance.kyc.view` (reveal PAN and Aadhaar, audited). No new role. Responding and signing need a current term linked to the user | Duties sit on top of existing roles |
| Deed rules | Dated deed versions; each resolution and meeting is checked against the version in force on its date | Amendments must not rewrite history |
| Order | Circulars first, meetings later | With two trustees no meeting can be quorate |
| Pass rule | Majority of trustees in office at issue; templates may require two-thirds (amendment) or unanimity of the others (removal) | Clauses 4.18, 9.3, 7.12 |
| Numbering | Per financial year, assigned on pass: `PI/TR/2026-27/NNN` | Continues the paper series |
| Immutability | Decided resolutions never change; a new one amends or rescinds. An issued circular is withdrawn and reissued, never edited | Signatures cover a fixed revision |
| Signing | DSC through a local helper (primary); Acrobat download and upload; Leegality Aadhaar eSign (allowed for any signature). Each records its method. Engine: a pyHanko sidecar | Every trustee has a HyperSecu HYP2003 on Windows or Mac; pyHanko does PAdES, external signing and LTV |
| Long-term validity | DigiCert timestamp and LTV data when final; yearly document timestamp after | Signatures must outlive certificates |
| Vote confirmation | Signing or objecting needs a sign-in within 10 minutes and a confirm step, and is audited | Shared laptops must not vote |
| Meetings | Hybrid; secretary marks attendance; video counts as present; quorum live per agenda item; absentee written votes count toward the result, not quorum; the chair has the casting vote and signs minutes | Clauses 4.15–4.22; the 4.7/4.17 conflict resolved for the chair |
| Trustee changes | By resolution with a cessation basis (resignation, term end, absence 4.23, death, removal 7.12). Removal needs a recorded hearing and written reasons | Removal is a misconduct process |
| History | Past records imported read-only with evidence and a validity note | The register must answer for any date since 2019 |
| Deed amendment | Template for the resolution only; the registered Deed of Amendment is uploaded and creates a new deed version | Execution and registration are on paper |
| Finance | No trustee tier in approvals. A non-reimbursement payment to a trustee warns | Clause 7.24 |
| Placement | "Governance" sidebar section; "Needs your vote or signature" dashboard card | Agreed scope |

## Deed rules (version 1)

| Clause | Rule | Enforcement |
|---|---|---|
| 4.4, 4.5 | Co-Founders who are Managing (MT) or Joint Managing Trustee (JMT) serve for life; others 3 years unless reappointed; MT and JMT together may co-opt for up to 3 years | Term end dates; co-option records both co-opters |
| 4.12, 4.14 | 2 to 9 trustees; below 2 only vacancies may be filled | Warnings; non-appointment resolutions blocked |
| 4.13 | Retirement any time, no reasons | Needs evidence, not acceptance |
| 4.15, 5.3 | Quorum 5 present and voting including the MT; conflicted trustees neither vote nor count | Live quorum per item |
| 4.16, 4.19 | Officers: President (chairs), Vice President, Secretary, Treasurer; 7 days' notice with agenda | Shorter notice blocked |
| 4.17 | Simple majority; Chairman's casting vote | Casting vote for the chair only |
| 4.18 | Circular issued by the MT to all, signed by a majority, noted at the next meeting | Only the MT issues; "to be noted" agenda list |
| 4.20 | Absentee written views count as a vote | Absentee votes |
| 4.22 | Minutes signed by the chair of that or the next meeting | Chair signs by default |
| 4.23 | Absent without leave from all meetings for six months or three consecutive meetings, whichever is later, ceases | Attendance flag, then a cessation resolution |
| 4.24 | New trustees accept in writing | Signed acceptance before the term starts |
| 7.12 | Removal by unanimous vote of the others after a hearing, reasons in writing | Removal template with hearing record |
| 7.18 | Banks operated by MT and/or JMT or an authorised person; certified copies by MT and/or Chairman | Certified-copy signers |
| 7.24 | No remuneration, only expenses | Finance warning |
| 9.3 | Amendment by two-thirds at a properly convened meeting with the Income-tax Commissioner's prior approval | Template threshold |

The pending amendment (circular PI/TR/2026-27/002, on paper) sets quorum to half the trustees in office with a floor of two, lets the JMT issue circulars when the MT cannot, allows email circulation and e-signatures, and counts video attendance. It becomes version 2 when the registered deed is uploaded.

## Model

```
deed_version ── rules in force on a date
trustee ─ trustee_term ─ trustee_office          signing_certificate
resolution_template → resolution (draft → issued → passed / failed / withdrawn)
                         ├─ resolution_revision PDF ── signature
                         └─ resolution_response (assent | objection)
meeting ─ agenda_item ─ attendance ─ vote → minutes (Plate → PDF → signatures)
governance_document (vault)    compliance_item ─ evidence
```

| Table | Key columns |
|---|---|
| `trustee` (Zero) | user_id (null for historical), legal_name, is_co_founder |
| `trustee_private` (`private` schema) | pan_name, pan (encrypted), aadhaar_name, aadhaar_last4, aadhaar_reference (encrypted), address, email, phone |
| `trustee_term` (Zero) | starts_on, ends_on (null for life), basis (deed_original, co_option_4_5, appointment_7_9, reappointment), acceptance_document_id, ended_on, cessation_basis, source_resolution_id, evidence_document_id, validity_note, evidenced |
| `trustee_office` (Zero) | office (managing_trustee, joint_managing_trustee, president, vice_president, secretary, treasurer, co_founder), starts_on, ended_on, source_resolution_id, validity_note |
| `deed_version` | number, effective_from, document_id, quorum_kind (fixed, fraction), quorum_value, quorum_floor, quorum_required_office, circular_issuers (offices, fallback order), electronic_circulation, video_counts_present, casting_vote (chair, co_founders, none), notice_days, min/max_trustees, co_option_max_years, amendment_threshold |
| `resolution_template` | key, title, body (Plate JSON with fields), threshold (majority_in_office, two_thirds_in_office, unanimous_others), effects (register changes on pass), requires_hearing, active |
| `resolution` | number, fiscal_year, kind (circular, meeting), template_key, status, drafted_by, issued_by, issued_at, response_due_on, decided_at, outcome_note, trustees_in_office (snapshot), deed_version_id, amends/rescinds_resolution_id, historical, validity_note |
| `resolution_revision` | revision, body, PDF key, sha256 |
| `resolution_response` | trustee_id, response, reason, conflict_declared, responded_at, signature_id |
| `meeting`, `agenda_item`, `attendance`, `vote` | convened_by, notice_sent_at, starts_at, mode, deed_version_id; order, resolution_id; present_as (in_person, video, absent_with_leave, absent); choice, absentee_written, conflict |
| `signing_certificate` | trustee_id, method (dsc, esign), subject_cn, issuer, serial, sha256 fingerprint, not_before, not_after, enrolled_at, revoked_at |
| `signature_request` | document (revision or minutes), signer, field_name, method, job_token_hash, expires_at, status |
| `signature` | request_id, method (dsc_helper, acrobat_upload, esign, ink_historical), certificate_id, signed_at (CMS time), timestamp_token_at, resulting PDF revision, validation_report |
| `governance_document` | kind (trust_deed, deed_amendment, registration_certificate, resolution, minutes, resignation, acceptance, policy, evidence, other), title, dated_on, private R2 key, sha256, original filename, source_format (pdf, signed_pdf, eml, scan), validation_report, uploaded_by |
| `compliance_template`, `compliance_item` | title, rule (fixed date, offset from a registration's validity, or term end), owner role; due_on, owner, status, evidence_document_id, closed_by |

### Register rules

- A trustee may hold several offices. An office has one holder at a time and cannot outlast the holder's term.
- The register answers "who held which office on date D" for any date since 16-03-2019.
- Term-end reminders at 90, 30 and 7 days; a loud warning when an ending term would leave fewer than two trustees.
- A deed version applies only to resolutions issued and meetings convened on or after its effective date. Version 1 is seeded from Doc. No. 864.

### Resolution lifecycle

- Draft: edited through Zero by `governance.manage`.
- Issue (MT only): freeze a revision, render the PDF with `@pi-dash/pdf`, snapshot trustees in office, notify every trustee.
- Respond: an assent is a signature on the PDF; an objection is a click with a reason.
- Pass: signed assents reach the threshold. Assign the number, apply the template's register effects in the same transaction, finalise the PDF (B-LTA), add to the next meeting's "to be noted" list.
- Fail: the response date passes or objections make the threshold unreachable.
- Withdraw: the issuer, before it passes.
- A trustee who declares a conflict cannot respond and leaves the count; if the threshold becomes unreachable, the app says so before issue.
- Launch templates: ordinary, appointment or co-option, cessation, office-bearer designation, bank operation, registered office shift, deed amendment (threshold only), removal under 7.12.

### Meetings

Quorum and results are per agenda item. An inquorate meeting records discussion but passes nothing. Minutes start from the agenda in the Plate editor, render to PDF and are signed by the chair.

### Vault and history import

- The existing `organisation_registration` table gets screens and links its certificate to a vault document.
- History import builds historical resolutions, terms and offices from a scan, an `.eml` with full headers, or a signed PDF (validated by the sidecar, signer matched to the register).
- Each imported fact has a validity note (for example "meeting inquorate; co-option relies on 4.5; ratified by PI/TR/2026-27/001"). A date without a document is marked unevidenced.

### Compliance calendar

- Seeds: Form 112 (30 September), ITR-7 (31 October), Forms 113 and 114 (31 May), quarterly TDS, next year's budget (31 March, clause 7.7), annual accounts meeting, yearly report to principal donors, 80G renewal (about 30 September 2030), trustee term ends.
- Reminders 30, 7 and 1 days ahead through notifications. Items close only with evidence.

### Declarations, policies, annual pack

- Conflict-of-interest declarations yearly per trustee (a click and a generated PDF, no DSC) and per resolution or agenda item. Related parties feed the finance warning.
- Policy register with versions and per-policy acknowledgement audiences. Volunteers without the current child-safeguarding acknowledgement are blocked from events involving children, including Kalakriti.
- Annual approvals (budget, accounts, auditor appointment, Form 109 accumulation) are templates opened by calendar items.
- CSR utilisation certificates come from the ledger once grants exist (finance Phase 5), DSC-signed.

## Signing pipeline

Browsers cannot reach PKCS#11 tokens, so signing is external:

1. The sidecar adds an empty signature field to the issued revision. The first signature certifies (DocMDP: form filling and signing allowed); later ones are incremental updates.
2. A `signature_request` is created; the user opens a `pidash-sign://` link with a one-time token (hashed at rest, 15-minute expiry).
3. The helper fetches the digest over HTTPS, asks for the PIN in its own window (once per batch, never stored), signs through PKCS#11 and posts back signature and certificate.
4. The sidecar embeds the CMS signature, adds a DigiCert timestamp (PAdES B-T) and checks: enrolled fingerprint, chain to the CCA India root, validity dates, and that only this signature changed the PDF.
5. On pass it adds revocation data and a document timestamp (B-LTA). A yearly job re-timestamps final documents.

- Helper: Rust with `cryptoki`. PKCS#11 path per OS (Mac: `/usr/local/lib/libcastle_v2.1.0.0.dylib`, universal). Free distribution: one-line Terminal install with ad-hoc signing on Mac; open-source build signed through SignPath Foundation on Windows.
- Enrolment reads the token's certificate once; renewal re-enrols. DSC renewals after 21 September 2026 need FIPS 140-3 tokens, so some HYP2003s will be replaced.
- Acrobat fallback: download the prepared PDF, sign, upload; validated as in step 4.
- Leegality eSign: about ₹25 per signature; Leegality receives the full PDF; the Aadhaar name is checked against the register.
- The sidecar has no public route. Signed PDFs live in R2 behind short-lived guarded URLs.

## Security and audit

- Routes check permissions in `beforeLoad`; server functions use `assertServerPermission` or the trustee check. Responding and signing are server functions (session age check, sidecar calls).
- Every state change (draft, issue, respond, sign, withdraw, attendance, vote, register change, import, upload) goes through the Zero mutation audit boundary or `runSessionAuditedAction`. PAN and Aadhaar reveals are audited like `party.identifier.reveal`. Metadata holds IDs and field names only.
- PAN and Aadhaar references use the existing data encryption key, in the `private` schema.
- Signed PDFs, emails and scans are server-only. Leegality is a processor that sees the full document, and the trustee notice says so.
- Governance records are kept permanently.

## Board at design time

After circular PI/TR/2026-27/001 (ink-signed 18 October 2026):

| Trustee | Offices | Term |
|---|---|---|
| Sarjun H Hajathulla | Co-Founder; MT from 04-04-2026 | Life (4.4) |
| Somasundaram Ayyappan | Secretary from 07-12-2025; JMT from 18-10-2026 | 07-12-2025 to 06-12-2028 (co-option, 4.5) |

- Former: Chenthil Kumar S (Co-Founder, MT; resigned 04-04-2026 by DSC-signed letter), Sameedha Vinaykumar Salvi (Vice President; resigned 16-10-2026 by email), Swathipriya S (16-10-2025), Gagandeep Singh (13-10-2025), Anitha Samraj Chandrasekaran (17-11-2025; start unevidenced).
- President, Vice President and Treasurer are vacant: no casting vote until a President is elected.
- Registered office from 18-10-2026: WorkFlo Ranka Junction, KR Puram, Bengaluru 560016.

## Phases

| Phase | Scope | Gate |
|---|---|---|
| 1 Register and vault | Permissions, register tables, `deed_version` v1, vault, `organisation_registration` screens, sidecar (validation only), history import, warnings and reminders, sidebar section | The board above, with evidence or an unevidenced flag for every date |
| 2 Circulars | Templates, issue, PDF, field preparation, responses and conflicts, Acrobat signing, pass and fail, numbering, register effects, dashboard card, notifications | A test circular passes with two Acrobat DSC signatures valid in Adobe Reader |
| 3 Signing | Helper and installers, enrolment, `pidash-sign://`, B-T, B-LTA, yearly re-timestamp, Leegality | HYP2003 signatures from Mac and Windows, and an eSign, valid in Adobe Reader |
| 4 Compliance calendar | Templates, items, evidence, reminders, registration renewals | FY 2026-27 seeded with owners |
| 5 Meetings | Notice, agenda, attendance, live quorum, absentee and casting votes, Plate minutes, chair signature, "to be noted" | A test meeting under version 2 yields signed minutes |
| 6 Annual pack and policies | Annual templates, declarations and finance warning, policy register and safeguarding gate, CSR certificates | CSR after finance Phase 5 |

Each phase ships migrations, idempotent seeds in `scripts/seed.ts`, Zero regeneration, the agent-guide routing row and E2E coverage of its state machines. The sidecar (phase 1) and helper (phase 3) go into `DEPLOYMENT.md`.

## Open questions

1. Does Adobe Reader trust Leegality eSign without setup? (It trusts the DSCs.) Test first in phase 3.
2. Ink-signed circulars after go-live: historical imports, or a first-class method with scan upload?
3. Version 2 values await counsel's final amendment wording.
4. Windows PKCS#11 path for the HyperSecu driver, to read from a trustee's laptop.
