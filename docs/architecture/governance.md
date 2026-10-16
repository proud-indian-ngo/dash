# Governance (design)

> **Status**: design agreed 17 October 2026; nothing built yet. Delivery is in six phases (section 9).
> **Load when**: governance, trustee, trustee register, Board of Trustees, office-bearer, Managing Trustee, resolution, circular resolution, board meeting, quorum, minutes, trust deed, deed version, DSC, HYP2003, PKCS#11, signing helper, pyHanko, Aadhaar eSign, Leegality, compliance calendar, conflict of interest, policy register, safeguarding, CSR utilisation certificate, annual approvals pack.
> **Related**: `finance-and-programmes.md` (organisation registrations, ledger for CSR certificates), `authorization.md`, `file-uploads.md`, `pdf.md`, `editor.md`, `notifications.md`, `jobs.md`, `data-layer.md`

## 1. Why

Proud Indian is a public charitable trust in Karnataka, constituted by a deed registered as Doc. No. 864, Book IV, 2018-19, at the Shivajinagar (Indiranagar) Sub-Registrar on 16-03-2019. Bengaluru has no Charity Commissioner, so the deed alone governs how the Board decides. Board business has so far lived in Word files, emails and scans, and one record (the 07-12-2025 resolution) claimed a quorum it did not have.

pi-dash has no trustee concept today. Goal: pi-dash holds the trustee register, runs circular resolutions and meetings by the deed's rules, gets each decision signed with the trustees' DSC tokens or Aadhaar eSign, keeps the trust's registrations and deeds, and drives the yearly compliance calendar with evidence.

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Who can vote | Only people on the trustee register with a current term. Each register entry links to a pi-dash account | The deed's rules count trustees in office, not app users |
| Permissions | `governance.view` (read), `governance.manage` (secretary or admin runs the process), `governance.kyc.view` (reveal PAN and Aadhaar, audited per view). No new app role | Governance duties sit on top of a user's existing role |
| Deed rules | Stored as dated deed versions, not hard-coded. Every resolution and meeting is checked against the version in force on its date | The deed is being amended (quorum, circulars); history must keep its original rules |
| Resolution routes | Circular resolutions first, meetings second | With two trustees no meeting can be quorate under clause 4.15 |
| Circular process | Secretary or `governance.manage` drafts; the Managing Trustee issues; each approving trustee signs the PDF; an objection is a click with a reason | Clause 4.18: "issued and circulated by the MANAGING TRUSTEE" and "signed by a majority of the TRUSTEES" |
| Pass rule | Majority of all trustees in office at issue, unless the template sets a higher threshold (two-thirds for deed amendment, unanimity of the others for removal) | Clauses 4.18, 9.3 and 7.12 |
| Numbering | Per financial year when passed: `PI/TR/2026-27/NNN` | Continues the paper series that starts with 001 |
| Immutability | A passed or failed resolution never changes. Fixes go in a new resolution that amends or rescinds it. An issued circular cannot be edited; it is withdrawn and reissued | Signatures cover a fixed revision |
| Signatures | DSC through a local helper app (primary), Acrobat download and upload (fallback), Leegality Aadhaar eSign (fallback, allowed for any signature). Each signature records its method | Every trustee holds a HyperSecu HYP2003; laptops are Windows and Mac |
| Signing engine | pyHanko sidecar service | Mature PAdES, external signing, validation and long-term validation in one library |
| Long-term validity | Free DigiCert timestamp and LTV data when a document is final; a yearly document timestamp after that | Signatures must verify after the signing certificates expire |
| Vote confirmation | Signing or objecting needs a sign-in from the last 10 minutes and a confirm step, and is audited | A shared or unattended laptop must not cast a vote |
| Meetings | Hybrid. The secretary marks attendance; video counts as present; quorum is computed live per agenda item. Absent trustees' written votes count toward the result but not toward quorum. The chair has the casting vote and signs the minutes | Clauses 4.15 to 4.22; the 4.7 and 4.17 casting-vote conflict resolved in favour of the chair |
| Trustee changes | Recorded by resolution with a cessation basis (resignation, term end, absence under 4.23, death, removal under 7.12). Removal needs a recorded hearing and written reasons | Removal is a misconduct process, not a way to record people who left |
| History | Past documents are imported as read-only historical records with evidence and a validity note | The register must show who was a trustee on any date since 2019 |
| Deed amendment | Out of scope as a workflow. The amendment resolution uses a template; the registered Deed of Amendment is stored in the vault and creates a new deed version | Execution and registration happen on paper at the Sub-Registrar |
| Finance link | Finance approvals keep no trustee tier. A payment to a trustee that is not an expense reimbursement raises a warning | Clause 7.24 forbids remuneration to trustees |
| Placement | New "Governance" sidebar section; a "Needs your vote or signature" card on trustees' dashboards | Agreed scope |

## 3. The deed and its rules

Rules from Doc. No. 864 that pi-dash enforces (deed version 1):

| Clause | Rule | Enforcement |
|---|---|---|
| 4.4, 4.5 | Co-Founders who are Managing Trustee or Joint Managing Trustee hold office for life; other trustees serve 3 years unless reappointed; the Managing Trustee and Joint Managing Trustee together may co-opt trustees for up to 3 years each | Term end dates on the register; co-option records both co-opting office-holders |
| 4.12, 4.14 | 2 to 9 trustees; below 2 the board may act only to fill vacancies | Register warnings; resolutions other than appointments are blocked below 2 |
| 4.13 | A trustee may retire at any time without reasons | Resignation needs evidence, not acceptance |
| 4.15, 5.3 | Quorum 5 present and voting, including the Managing Trustee; a conflicted trustee neither votes nor counts | Live quorum per agenda item |
| 4.16, 4.19 | Officers: President (chairs), Vice President, Secretary, Treasurer. Meetings need at least 7 days' notice with an agenda | Notice cannot be sent with less than 7 days |
| 4.17 | Simple majority at meetings; the Chairman's casting vote | Casting vote recorded only for the chair |
| 4.18 | Circular issued by the Managing Trustee to all trustees, signed by a majority, noted in the next meeting's minutes | Issue restricted to the Managing Trustee; "to be noted" list on the next agenda |
| 4.20 | An absent trustee's written views count as a vote | Absentee votes on agenda items |
| 4.22 | Minutes signed by the chair of that meeting or the next | Chair is the default minutes signer |
| 4.23 | A trustee absent without leave from all meetings for six months or three consecutive meetings, whichever is later, ceases | Flag from attendance; a resolution records the cessation |
| 4.24 | A new trustee accepts in writing | Signed acceptance before the term starts |
| 7.12 | Removal by unanimous vote of all other trustees after a hearing, with reasons in writing | Removal template with hearing record |
| 7.18 | Bank operation by the Managing Trustee and/or Joint Managing Trustee or an authorised person; certified copies by the Managing Trustee and/or Chairman | Certified-copy signers |
| 7.24 | No remuneration to trustees, only expenses | Finance warning |
| 9.3 | Amendment by two-thirds at a properly convened meeting, with the Income-tax Commissioner's prior approval | Amendment template threshold |

The planned amendment (circular PI/TR/2026-27/002, on paper) changes the quorum to one-half of trustees in office with a floor of two, lets the Joint Managing Trustee issue circulars when the Managing Trustee cannot, allows email circulation and electronic signatures, and counts video attendance. It becomes deed version 2 when the registered deed is uploaded.

## 4. Model

```
deed_version ── rules in force on a date
      │
trustee ─ trustee_term ─ trustee_office          signing_certificate
      │                                                 │
resolution_template → resolution (draft → issued → passed / failed / withdrawn)
                         │  revision PDF ── signature (dsc | acrobat | esign | ink, historical)
                         └─ resolution_response (assent | objection, with reason)
meeting ─ agenda_item ─ attendance ─ vote → minutes (Plate → PDF → signatures)
governance_document (vault: deeds, certificates, evidence) ← historical records
compliance_item (calendar) ─ evidence
```

### 4.1 Trustee register

| Table | Key columns | Sync |
|---|---|---|
| `trustee` | id, user_id (nullable for historical trustees), legal_name, is_co_founder, created_at | Zero, to `governance.view` |
| `trustee_private` | trustee_id, pan_name, pan (encrypted), aadhaar_name, aadhaar_last4, aadhaar_reference (encrypted), address, email, phone | Server only, `private` schema |
| `trustee_term` | trustee_id, starts_on, ends_on (null for life), basis (deed_original, co_option_4_5, appointment_7_9, reappointment), acceptance_document_id, ended_on, cessation_basis (resignation, term_end, absence_4_23, death, removal_7_12), source_resolution_id, evidence_document_id, validity_note, evidenced (bool) | Zero |
| `trustee_office` | trustee_id, office (managing_trustee, joint_managing_trustee, president, vice_president, secretary, treasurer, co_founder), starts_on, ended_on, source_resolution_id, validity_note | Zero |

Rules: a trustee may hold several offices; an office has at most one holder on a date; an office cannot outlast its holder's term. The register answers "who was a trustee, in which offices, on date D" for any date since 16-03-2019. Reminders go out 90, 30 and 7 days before a term ends, and a loud warning shows when an ending term would take the board below two.

### 4.2 Deed versions

`deed_version`: number, effective_from, document_id (the registered deed or amendment), and the rule values: quorum_kind (fixed, fraction), quorum_value, quorum_floor, quorum_required_office, circular_issuers (offices, in fallback order), electronic_circulation (bool), video_counts_present (bool), casting_vote (chair, co_founders, none), notice_days, min_trustees, max_trustees, co_option_max_years, amendment_threshold. Version 1 is seeded from Doc. No. 864. A new version applies only to resolutions issued and meetings convened on or after its effective date.

### 4.3 Resolutions

| Table | Key columns |
|---|---|
| `resolution_template` | key, title, body (Plate JSON with fields), threshold (majority_in_office, two_thirds_in_office, unanimous_others), effects (register changes it applies when passed), requires_hearing (bool), active |
| `resolution` | id, number (null until passed), fiscal_year, kind (circular, meeting), template_key, title, status, drafted_by, issued_by, issued_at, response_due_on, decided_at, outcome_note, trustees_in_office (snapshot at issue), deed_version_id, amends_resolution_id, rescinds_resolution_id, historical (bool), validity_note |
| `resolution_revision` | resolution_id, revision, body, pdf object key, sha256, created_at |
| `resolution_response` | resolution_id, trustee_id, response (assent, objection), reason, conflict_declared (bool), responded_at, signature_id |

Lifecycle: **draft** (Zero-edited by `governance.manage`) → **issued** by the Managing Trustee (freezes a revision, renders the PDF through `@pi-dash/pdf`, snapshots the trustees in office, notifies every trustee) → **passed** when signed assents reach the threshold, **failed** when the response date passes or enough objections make the threshold unreachable, or **withdrawn** by the issuer before it passes. Passing assigns the number, applies the template's register effects in the same transaction, finalises the PDF (section 5), and adds the resolution to the next meeting's "to be noted" list. A trustee who declares a conflict cannot respond and is excluded from the count; if that makes the threshold unreachable, pi-dash says so before issue.

Templates at launch: ordinary resolution, appointment or co-option of a trustee, cessation of a trustee, designation of an office-bearer, bank operation, registered office shift, deed amendment (threshold only; no execution workflow), removal under 7.12.

### 4.4 Meetings and minutes

`meeting` (convened_by, notice_sent_at, starts_at, mode, deed_version_id), `agenda_item` (meeting_id, order, resolution_id), `attendance` (trustee_id, present_as: in_person, video, absent_with_leave, absent; marked by the secretary), `vote` (agenda_item_id, trustee_id, choice, absentee_written, conflict). Quorum and the result are computed per agenda item. A meeting that is inquorate can record discussion but cannot pass resolutions. Minutes start from the agenda in the Plate editor, render to PDF and are signed by the chair after the meeting.

### 4.5 Signatures

| Table | Key columns |
|---|---|
| `signing_certificate` | trustee_id, method (dsc, esign), subject_cn, issuer, serial, sha256 fingerprint, not_before, not_after, enrolled_at, revoked_at |
| `signature_request` | document (resolution revision or minutes), signer trustee_id, field_name, method, job_token_hash, expires_at, status |
| `signature` | request_id, method (dsc_helper, acrobat_upload, esign, ink_historical), certificate_id, signed_at (from the CMS signing time), timestamp_token_at, pdf revision after signing, validation_report |

### 4.6 Documents vault and history import

`governance_document`: kind (trust_deed, deed_amendment, registration_certificate, resolution, minutes, resignation, acceptance, policy, evidence, other), title, dated_on, object key (R2, private), sha256, original filename, source_format (pdf, signed_pdf, eml, scan), validation_report (for signed PDFs), uploaded_by. The existing `organisation_registration` table gets its screens and links its certificate to a vault document.

The history import creates historical resolutions, terms and offices from a scan, an `.eml` with full headers, or a signed PDF. Signed PDFs are validated by the pyHanko sidecar and the signer is matched to the register. Each imported fact carries a validity note (for example "meeting inquorate; co-option relies on 4.5; ratified by PI/TR/2026-27/001"), and a start or end date with no document behind it is marked unevidenced.

### 4.7 Compliance calendar

`compliance_template` (title, rule: fixed date, offset from a registration's validity, or term end; owner role) and `compliance_item` (due_on, owner, status, evidence_document_id, closed_by). Seeds: Form 112 (30 September), ITR-7 (31 October), Form 113 and 114 (31 May), quarterly TDS returns, next year's budget (31 March, clause 7.7), the annual accounts meeting, the yearly report to principal donors, 80G renewal (due about 30 September 2030), and trustee term ends. Reminders go through existing notifications 30, 7 and 1 days ahead; an item closes only with an evidence upload.

### 4.8 Declarations and policies

- Conflict-of-interest declaration: yearly per trustee (a click plus a generated PDF, no DSC) and per resolution or agenda item. Declared related parties feed the finance warning.
- Policy register: each policy has versions and its own acknowledgement audience. The child-safeguarding policy hard-gates volunteers who have not acknowledged the current version from events involving children, including Kalakriti.

### 4.9 Annual pack and CSR certificates

The annual approvals pack (budget, accounts, auditor appointment, Form 109 accumulation) is a set of resolution templates opened by calendar items. CSR utilisation certificates are generated from the finance ledger once grants exist (`finance-and-programmes.md` Phase 5) and signed with a DSC.

## 5. Signing pipeline

Browsers cannot reach PKCS#11 tokens, so signing uses deferred (external) signing:

1. The server asks the pyHanko sidecar to prepare the issued revision with an empty signature field for the signer. The first signature certifies the document (DocMDP, form filling and signing allowed); each later signature is an incremental update.
2. A `signature_request` is created and the user clicks a `pidash-sign://` link carrying a one-time job token (hashed at rest, expires in 15 minutes).
3. The helper fetches the digest to sign over HTTPS, asks for the token PIN in its own window (once per batch, never stored), signs through PKCS#11, and posts the signature and certificate back.
4. The sidecar embeds the CMS signature, adds a DigiCert timestamp (PAdES B-T), and validates: the certificate matches the trustee's enrolled fingerprint, chains to the CCA India root, is within validity, and the PDF changed only by this signature.
5. When the resolution passes, the sidecar adds revocation data and a document timestamp (B-LTA). A yearly job re-timestamps every final document.

Helper: Rust with the `cryptoki` crate. The PKCS#11 library path is configured per OS (Mac: `/usr/local/lib/libcastle_v2.1.0.0.dylib`, a universal build). Distribution costs nothing: a one-line Terminal install with ad-hoc signing on Mac; an open-source build signed through SignPath Foundation on Windows. Enrolment reads the certificate from the token once; renewal means enrolling again. DSC renewals after 21 September 2026 need FIPS 140-3 tokens, so some HYP2003s will be replaced.

Fallbacks: the Acrobat path downloads the prepared PDF, the trustee signs in Acrobat and uploads it, and step 4 validates it the same way. Aadhaar eSign goes through Leegality (about ₹25 per signature); Leegality receives the full PDF, the signer's Aadhaar name is checked against the register, and the method is recorded.

The sidecar is an internal service with no public route; the web app reaches it over the private network. Signed PDFs are stored in R2 and served through guarded, short-lived URLs.

## 6. Permissions and audit

- `governance.view`, `governance.manage` and `governance.kyc.view` are added in `packages/db/src/permissions.ts`. Responding to and signing a resolution are not permissions: they need a current trustee term linked to the signed-in user.
- Routes enforce the permission in `beforeLoad`; server functions use `assertHasPermission` or the trustee check.
- Every state change (draft, issue, respond, sign, withdraw, attendance, vote, register change, import, document upload) goes through the Zero mutation audit boundary or `runSessionAuditedAction`. Revealing PAN or Aadhaar is audited like `party.identifier.reveal`. Audit metadata carries IDs and field names only, never document text, names or numbers.
- Responding and signing run as server functions, because they check session age (10 minutes) and call the sidecar.

## 7. Data protection

- PAN and Aadhaar references are encrypted with the existing data encryption key and live in the `private` schema outside Zero replication.
- Signed PDFs, emails and scans may contain personal data; they are server-only and their URLs are short-lived.
- Leegality is a processor for eSign and sees the full document; the trustee notice says so.
- Governance records are kept permanently: they are the trust's constitutional record.

## 8. Board at design time

After circular PI/TR/2026-27/001 (signed in ink on 18 October 2026), the first records for the history import:

| Trustee | Offices | Term |
|---|---|---|
| Sarjun H Hajathulla | Co-Founder; Managing Trustee from 04-04-2026 | Life (clause 4.4) |
| Somasundaram Ayyappan | Secretary from 07-12-2025; Joint Managing Trustee from 18-10-2026 | 07-12-2025 to 06-12-2028 (co-option under 4.5) |

Former trustees: Chenthil Kumar S (Co-Founder, Managing Trustee; resigned 04-04-2026 by DSC-signed letter), Sameedha Vinaykumar Salvi (Vice President; resigned 16-10-2026 by email), Swathipriya S (16-10-2025), Gagandeep Singh (13-10-2025), Anitha Samraj Chandrasekaran (17-11-2025; start date unevidenced). President, Vice President and Treasurer are vacant, so there is no casting vote at meetings until a President is elected. Registered office from 18-10-2026: WorkFlo Ranka Junction, KR Puram, Bengaluru 560016.

## 9. Delivery phases

| Phase | Scope | Gate |
|---|---|---|
| 1 Register and vault | Permissions; `trustee`, `trustee_private`, `trustee_term`, `trustee_office`, `deed_version` (version 1 seeded), `governance_document`; screens for `organisation_registration`; pyHanko sidecar with validation only; history import with `.eml` and signed-PDF evidence; register warnings and term reminders; Governance sidebar section | Register shows section 8 with evidence for every date, or an unevidenced flag |
| 2 Circular resolutions | Templates, draft and issue, PDF rendering, sidecar signature-field preparation, responses with conflict declaration, signing by Acrobat upload, pass and fail rules, numbering, register effects, "Needs your vote or signature" card, notifications | A test circular passes with two Acrobat-signed DSC signatures that Adobe Reader shows as valid |
| 3 Signing | Rust helper and installers, certificate enrolment, `pidash-sign://` jobs, B-T signing, B-LTA finalisation, yearly re-timestamp job, Leegality eSign | A real HYP2003 signature from Mac and Windows validates in Adobe Reader; an eSign signature validates |
| 4 Compliance calendar | Templates, items, evidence, reminders, registration-driven renewals | Seeded calendar for FY 2026-27 with owners |
| 5 Meetings and minutes | Notice, agenda, attendance, live quorum, votes with absentee and casting votes, minutes in Plate, chair signature, "to be noted" circulars | A test meeting under deed version 2 produces signed minutes |
| 6 Annual pack and policies | Annual approvals templates, yearly conflict declarations and the finance warning, policy register with the safeguarding gate, CSR utilisation certificates | After finance Phase 5 for CSR certificates |

Each phase ships with migrations, idempotent seeds in `scripts/seed.ts`, Zero schema regeneration, the routing row in the agent guide, and E2E coverage of its state machines. The sidecar and helper add a service to `DEPLOYMENT.md` in phases 1 and 3.

## 10. Open items

1. Whether Adobe Reader trusts Leegality eSign signatures without extra setup (Adobe already trusts the trustees' DSCs). Test first in phase 3.
2. Ink-signed circulars after go-live: import them as historical records, or make ink a first-class signing method with a scan upload.
3. Deed version 2 values depend on counsel's final wording of the amendment.
4. Windows PKCS#11 library path for the HyperSecu driver, to be read from a trustee's Windows laptop.
