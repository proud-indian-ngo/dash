# Finance and Programmes (design)

> **Status**: design agreed; delivery in progress. Shipped: Phase 1 dimension tables, reference data, `finance.view`/`finance.manage`, and the Programmes settings page. Also shipped: `programme_id` on teams and events with the production backfill (migration 0114), a Programme column in the financial-year export plus a spending-by-programme chart, both derived from the event's current programme (not frozen until the posting layer exists, and requests without an event are not yet mapped through the submitter's team), a Projects settings page, the fiscal-year job, and the party foundation: `party` and `party_role` synced through Zero, `party_private` and `party_bank_account` in a server-only schema barrel with AES-GCM encrypted identifiers (`DATA_ENCRYPTION_KEY`), `user.party_id`, the `donors.view`, `donors.manage` and `finance.view_sensitive` permissions, and a Donors directory. Decision: contact details are readable by `donors.view` (admins and finance), the full identifier only by `finance.view_sensitive`, and the reveal is audited although it is a read. Not yet shipped: the replication-publication allowlist (private tables still replicate into zero-cache even though they never reach browsers), bank account UI, vendor migration onto parties, `project_id` on events, cost centres replacing the city enum, the treasurer role, the bigint paise migration, and everything from Phase 2 onward. Decisions were agreed with the founder on 13 October 2026 and revised through two rounds of independent design review the same day. Supersedes the expense-only model in `vendor-payments.md` and `cash-vouchers.md` once delivered.
> **Load when**: finance redesign, programme, project, fund, posting, ledger entry, account movement, account head, contribution, donor, receipt, Form 113/114 (formerly 10BD/10BE), FC-4, FCRA, grant, budget, approval policy, withholding/TDS, GST, in-kind, retention, legal hold.
> **Related**: `vendor-payments.md`, `cash-vouchers.md`, `authorization.md`, `data-layer.md`, `recurring-events.md`, `jobs.md`, `kalakriti-registration.md`

## 1. Why

Today pi-dash records three expense-request workflows (reimbursement, advance payment, vendor payment) with line items tagged by a flat expense category. Advance payments are no longer used; existing records stay read-only for history. There is no income, no fund, programme or period dimension, no budget, and no stored voucher register. The financial-year export decides the year from a different date per request type and drops vendor payments that have no invoice yet.

Year-end data is collected from Razorpay, give.do, UPI, bank statements, CSR agreements and pi-dash separately, then handed to the chartered accountant (CA), who consolidates and files. The donation statement (Form 113, formerly 10BD), donor certificates (Form 114, formerly 10BE) and, after FCRA registration, FC-4 all need data pi-dash does not hold.

Goal: pi-dash keeps the full operational financial record year-round, organised by programme, and produces exports that the CA, the Income Tax portal and the FCRA portal can take with minimal rework. Reports for learning (cost per beneficiary, budget vs actual, donor retention, volunteer effort) come from the same data.

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Role of pi-dash | Operational sub-ledger and donor CRM; the CA keeps the statutory double-entry books from pi-dash exports | CA consolidates once a year; double-entry inside pi-dash was rejected |
| Top-level unit | **Programme** by cause; optional time-boxed **project** under a programme (Kalakriti 2027 is a project under a persistent arts programme) | Teams were arbitrary. Programmes match how the trust describes its work and how grants report |
| Teams | Stay as volunteer groups for WhatsApp, attendance and self-join; money never links to a team | Keeps existing event tooling without a fake financial dimension |
| City | Becomes a `cost_centre` table (Bangalore, Mumbai, …) | New chapters without an enum migration |
| Books | Two append-only single-entry books linked by a posting group: a **recognition ledger** (income, expense, asset effects with dimensions) and an **account movement** book (confirmed money in and out of organisation accounts). Never summed together. Obligations (vendor balances, withholding) are read from frozen source documents and their allocations | One `direction` cannot mean both "we spent" and "money left the bank"; splitting them handles transfers, refunds, fees and withholding without double-entry |
| Money type | `bigint` paise in PostgreSQL, converted to rupees only at presentation and export. The Phase 1 gate proves the Drizzle, Zero and server-function wire representation and enforces safe-integer bounds at every conversion | `integer` tops out near ₹2.1 crore; Zero currently maps money to JavaScript numbers |
| Fiscal calendar | April to March, monthly periods; periods belong to postings, not documents | One document can approve in March, pay in April and settle in May |
| Dates | Economic date, posting date and bank value date are separate; Asia/Kolkata business dates | Receipt and payment dates are statutory facts; creation timestamps are not |
| Parties | One `party` identity anchor per person or organisation; finance-private data in server-only tables that never sync to the browser | One DPDP trail per person without leaking donor data through vendor pickers |
| Donor side | Full CRM: donor records, local receipts, Form 113 statement, Form 114 certificate tracking, donor history and retention | Agreed scope |
| Filing target | **FY 2026-27 Form 113 must be submitted and Form 114 certificates delivered by 31 May 2027.** Form 114 is generated by the portal after Form 113 is processed; pi-dash tracks and delivers it | Income-tax Act 2025 replaced 10BD/10BE with Forms 113/114 from 1 April 2026 |
| Imports | Razorpay via API; give.do, UPI and bank via monthly CSV. Bank files become statement lines that reconcile against movements, never donations directly | Gateway settlements and transfers must not become income |
| In-kind | Fair-value income plus consumption expense or asset holding, medium = in_kind, no account movement; included in the CA handoff under its own label | Programme cost and the CA need it; cash reconciliation must not |
| Approvals | Programme lead always; finance additionally above one per-programme threshold. No trustee tier. Creator, claimant and beneficiary cannot approve; no automatic approval for anyone, though an eligible admin may approve manually | Agreed scope, one threshold only |
| Corrections | Posted documents are frozen. A correction is a new document with `supersedes_id`; recognition corrections post reversal plus replacement, never a movement | Keeps the books append-only and the old document intact |
| FCRA | Common tables carry FCRA classifications plus the records FC-4 needs; FCRA activation is its own gate | The June 2026 FCRA rules require ultimate-donor and project-and-location utilisation schedules |
| Restriction | Funds carry `restriction`; award terms live on `grant_agreement` | Mostly unrestricted today, a few earmarked; CSR will add more |
| Advance payments | Discontinued. No new advance payments; the existing `advance_payment` tables become read-only history, excluded from new postings and included in the audit pack as legacy documents | Founder decision, 13 October 2026 |
| Approval threshold | Configurable in Settings: an organisation default plus an optional per-programme override, both editable by `finance.manage`. When the programme lead is the claimant, finance approves in their place | Founder wants it tunable without a deploy |
| Finance roles | One `treasurer` role confirms payouts and refunds, records adjustments, and closes or reopens periods. The approver may also execute the payment; the claimant may never approve or pay their own request | Small team; separation of duties is already provided by lead approval plus finance approval above the threshold |
| give.do | Collection intermediary only. Each give.do donor is our donor, gets our receipt, and appears in our Form 113. give.do's monthly CSV must carry donor name, ID and address; rows without them land on the readiness view | Founder confirmed we issue receipts |
| Restriction today | None. One seeded "General Fund (Domestic)"; the fund and grant tables exist from Phase 1 but have minimal UI until a restricted gift or grant arrives | All gifts are unrestricted today |
| Utilisation certificates | Cash-basis only: receipts versus cash spent in the period | Funders so far ask for cash spent only |
| Beneficiaries | Service contacts per event, never unique people | Avoids collecting children's identity data |
| CA handoff | XLSX workbook, one sheet per export, plus the CSV ZIP | CA preference |
| Ownership | The founder owns monthly imports, reconciliation, donor-data follow-up, legacy evidence and filing readiness until a treasurer volunteer is named | Current reality |
| Corporate engagements | A corporate volunteering day is a **project** of kind `engagement` under its cause programme, with a sponsor party, an optional intermediary party (Goodera), a quoted budget and a report obligation. The money is booked as a donation in the audited accounts (see section 8), so it enters as a contribution with `donation_type` csr or other; the sponsor's invoice request is an acknowledgement document, not fee income | Production data: most Mumbai events were corporate engagements sourced through Goodera; JP Morgan and IDFC paid by CSR grant or against invoice |
| Receivables | `issued_invoice` records what we bill to Goodera or a corporate, with no GST (the trust is not GST-registered); receipts allocate against it; tax deducted by the payer is recorded as TDS receivable for matching with Form 26AS | We are paid net of TDS; the CA needs the gross and the credit |
| Paid facilitators | A per-event contractor is a vendor party with withholding on each payment; the same pattern applies if Bangalore hires one | Mumbai used one paid contractor per event |
| Mumbai | Chapter closed. Cost centre Mumbai becomes inactive; its history stays reportable | Founder, 13 October 2026 |
| First release | Filing path first. Budgets, outcomes, volunteer valuation, pledges, campaigns and grant planning are deferred; they attach to stable IDs later without rewriting posted data | A volunteer-run trust with a few hundred requests and one to two thousand donations a year should not wait on dashboards for compliance |

## 3. Model

Documents are editable while pending. Submitting freezes a document revision. Approval, receipt or payment creates a **posting** that writes recognition entries and account movements in one server transaction. Recognition and cash totals come from their respective books; obligations and filings come from frozen source records and allocations.

```
parties ──┐
          ├─ documents (contribution, grant, reimbursement, vendor invoice, payout)
dimensions┘        │ submit → frozen revision → approve / receive / pay
                   ▼
            posting (idempotent per source action, period-checked)
              ├─ ledger_entry       recognition: income, expense, asset, with dimensions
              └─ account_movement   cash book: money in/out of org accounts
                   │
                   ▼
   reconciliation (statement lines ↔ movements), exports, filings, insights
```

### 3.1 Parties and private data

| Table | Key columns | Sync |
|---|---|---|
| `party` | id, `kind` (person, organisation), display_name, created_by, created_at | Zero: identity fields only, to users holding `donors.view` or `finance.view` |
| `party_role` | party_id, `role` (donor, sponsor, grantor, intermediary, vendor, volunteer, judge, partner), active, since | Zero: same guard |
| `party_private` | party_id (unique), email, phone, address lines, city, state, pincode, country, `id_type` (validated against the current Form 113 list by the filing adapter), `id_number` (encrypted), nationality or incorporation country, `foreign_source_assessment` (domestic, foreign, pending), assessed_on, assessment_note | Server only |
| `party_bank_account` | party_id, account_name, account_number (encrypted), ifsc, active | Server only |
| `vendor_profile` | party_id (unique), gstin (validated), status (pending, approved), default `tds_provision` | Zero: status and gstin only, to request creators for the approved-vendor picker |
| `user.party_id` | nullable FK, set on first finance interaction; existing user IDs unchanged | |
| `collection_event` | party_id, `processing_basis` (consent, voluntary_provision_7a, legal_disclosure_7d), purpose, notice_version, channel, occurred_at, consent given_at (nullable), withdrawn_at, evidence attachment | Server only |
| `data_rights_request` | party_id, type (access, correction, erasure, nomination), received_at, closed_at, outcome, handler | Server only |

Rules:

- Phase 1 introduces an explicit sync allowlist for Zero schema generation and the replication publication, with column-level treatment for mixed tables. Today generation consumes the whole schema barrel and the generated schema already syncs payee account numbers; those existing paths migrate together with the new tables. Sensitive values are read through server functions guarded by `finance.view_sensitive`. Receipt, invoice and filing snapshots that carry contact or ID data are server-only.
- Identity matching between a login user and a party needs reviewed evidence; shared email or phone alone does not merge.
- The existing `vendor` table migrates to `party` + `party_role(vendor)` + `vendor_profile` + `party_bank_account`, preserving the vendor UUID as the party ID. Vendor-payment creation requires an approved vendor profile.
- Deleting a login user never cascades into finance documents. Existing `onDelete: cascade` from `user` on reimbursement, advance payment, vendor and history tables becomes `set null` on actor columns, with the party retained. The current export's inner joins on `user` are replaced at the same time so retained documents are not dropped.

### 3.2 Dimensions

| Table | Key columns | Notes |
|---|---|---|
| `programme` | code, name, cause, description, lead_user_id, finance_threshold_paise (nullable override of the `app_config` default), active, sort_order | Required on every event; required on every programme-cost ledger entry |
| `project` | programme_id, code, name, `kind` (class, edition, drive, engagement, other), starts_on, ends_on, status, sponsor_party_id (optional), intermediary_party_id (optional), quoted_budget_paise (optional), report_due_on (optional) | Time-boxed initiative; can draw on several funds through grant allocations. Engagements carry the sponsor and, when sourced through a platform, the intermediary |
| `fund` | code, name, `source` (domestic, fcra), `restriction` (unrestricted, restricted, designated), grant_agreement_id (optional), active | Seed: "General Fund (Domestic)" |
| `cost_centre` | code, name, state_ut, active | Replaces the `city` enum. Seed: Bangalore, Mumbai |
| `account_head` | code, name, `type` (income, expense, asset, liability), parent_id, `tally_ledger_name`, active | Replaces `expense_category`. Tax eligibility and FCRA source are dimensions, not account heads |
| `org_account` | name, `kind` (bank, cash, gateway_clearing), `fund_source` (domestic, fcra), `fcra_role` (receipt, utilisation, none), bank details (encrypted), active | A UPI handle is a payment instrument on its bank account. Razorpay and give.do are `gateway_clearing` |
| `fiscal_year` | label (2026-27), starts_on, ends_on, closed_at | |
| `fiscal_period` | fiscal_year_id, month, starts_on, ends_on, closed_at, closed_by | Postings into a closed period are rejected server-side |

Events: `team_event` gains `programme_id` (required) and `project_id` (optional); `city` is replaced by `cost_centre_id`. `team_id` stays, and `team` gains `programme_id`. Programme and project are copied onto an occurrence when it is materialised, by every path that materialises (series exception creation, self-join, and the background materialiser in `packages/jobs/src/lib/materialize-occurrences.ts`). Changing a series' programme splits the series at an effective occurrence date, as the existing `following` scope already does; earlier occurrences keep the original classification even if materialised later. Posted event classifications never change implicitly. Financial links always point at a materialised occurrence. `kalakriti_edition` links to a project under the arts programme and keeps its own lifecycle.

### 3.3 Organisation registrations

| Table | Key columns |
|---|---|
| `organisation_registration` | `type` (pan, tan, 12ab, 80g, fcra, csr1, darpan), number, issued_on, valid_from, valid_to, permitted activities and States/UTs (FCRA), attachment |

Form 113 and FC-4 need the trust's own registration numbers on every filing. FCRA scope is recorded here before any foreign contribution is accepted.

### 3.4 Income documents

| Table | Key columns |
|---|---|
| `contribution` | party_id, `channel` (razorpay, give_do, upi, neft, cheque, cash, in_kind), `reporting_mode` (as the current Form 113 enum: cash, electronic_or_account_payee, in_kind, other with required description), `donation_type` (corpus, voluntary, specific_grant, csr, other with description), received_on, amount_paise, currency, original_currency and original_amount (foreign receipts), gateway_fee_paise, gateway_tax_paise, org_account_id, fund_id, programme_id (optional), project_id (optional), event_id (optional), `deduction_eligible` (yes, no, unknown), eligibility_reason, `fcra_source_assessment` snapshot, intermediary_party_id, in_kind_description, in_kind_valuation_basis, grant_tranche_id, `status` (pending, received, receipted, refunded, reversed), supersedes_id, notes |
| `contribution_ultimate_donor` | contribution_id, party_id, identity snapshot, amount_paise | Intermediary vehicles (donor-advised funds, give.do where it is the grantor); required for FC-4 |
| `other_income` | kind (interest, grant_return, asset_income, misc), received_on, amount_paise, org_account_id, fund_id, grant_agreement_id (optional) | Never enters donation filings |
| `issued_invoice` | party_id (payer: Goodera or the corporate), project_id, invoice_number (FY sequence), invoice_date, due_on, lines (description, amount_paise), gross_total_paise, status (draft, issued, part_paid, paid, written_off), supersedes_id, pdf attachment | Fee income for engagements. Recognised on issue; never in donation filings |
| `issued_invoice_receipt` | issued_invoice_id, received_on, amount_paise, org_account_id, reference, `tds_deducted_paise` (recorded as TDS receivable for Form 26AS matching) | Receipt allocates against the invoice; gross = cash + TDS deducted |
| `receipt` | fiscal_year_id, `number` (FY sequence, allocated in the posting transaction, never reused), contribution_id, donor_snapshot (server only), donee_registration_snapshot, issued_at, issued_by, voided_at, pdf attachment |
| `grant_agreement` | party_id (grantor), title, total_paise, signed_on, award_start, award_end, `reporting_basis` (cash, recognised), opening_unspent_paise, reporting_cadence, reporting_requirements (jsonb: template, treatment of assets, advances, commitments, interest), attachments |
| `grant_tranche` | grant_agreement_id, due_on, amount_paise, received contribution_id |
| `grant_expenditure_allocation` | grant_agreement_id, ledger_entry_id, amount_paise | An entry is allocated to at most one grant; allocations never exceed the entry |

Deferred to a later release: `pledge`, `campaign`, `grant_budget_line`.

Receipt rule: gross amount is recognised as income; gateway fee and its tax are recognised as expense from provider evidence; the movement into the gateway clearing account is the gross amount, and settlement to bank is a transfer of the net.

### 3.5 Donation filing (Form 113 and 114)

| Table | Key columns |
|---|---|
| `donation_filing` | fiscal_year_id, form_version, `kind` (original, correction), status (draft, exported, submitted, processed, superseded), exported_at, submitted_at, acknowledgement_number, supersedes_filing_id, export attachment |
| `donation_filing_row` | filing_id, party_id, `intent` (add, revise, delete), donor_snapshot (server only: name, address, id type, id number encrypted), donation_type, reporting_mode, amount_paise, source contribution allocations (jsonb), portal_row_reference, acknowledgement_reference, supersedes_row_id |
| `donation_certificate` | filing_row_id, Form 114 reference, attachment, received_at, delivered_at, delivery channel |

Rules: one row per donor per donation type per reporting mode. Submitted snapshots are immutable; a correction filing revises or deletes acknowledged rows, and additional donations go in a new original filing. A contribution is filing-ready only when the donor has an accepted ID type and number and an address; rows missing these appear on a readiness view, never silently dropped. A versioned adapter validates ID types, reporting modes and required descriptions against the current portal contract, so a form change does not touch contribution data.

### 3.6 Expense documents

Existing `reimbursement`, `vendor_payment` and `vendor_payment_transaction` stay, with these changes. `advance_payment` and its child tables become read-only: creation and edit mutators are removed, the UI shows them as a legacy list, and they take no part in postings.

- All amounts become `*_paise bigint`.
- Every line item references `account_head_id`, `fund_id`, `programme_id` (from the header; one programme per request), optional `project_id` and `event_id`, and carries `incurred_on`.
- Header gets `cost_centre_id`, `revision`, `submitted_at` and `supersedes_id`. Submitting freezes the revision. A financial edit before posting bumps the revision and invalidates outstanding approvals. After posting, a correction is a new document with `supersedes_id`.
- **Payout** is a first-class record for reimbursements and vendor payments: `payout` (document_type, document_id, amount_paise, paid_on, org_account_id, payment_reference, paid_by, status pending/confirmed/failed). Each payout is its own posting source. A reimbursement is `paid` when confirmed payouts cover the approved amount.
- **Vendor invoice**: `vendor_invoice` header (supplier identity snapshot, supplier_gstin, recipient_gstin, invoice_number, invoice_date, place_of_supply, reverse_charge, gross_total_paise) and `vendor_invoice_line` (taxable_value_paise, hsn_sac, gst_rate_bp, cgst, sgst_utgst, igst, cess, recoverable_tax_paise, account head and dimensions). For gross G and recoverable tax T, recognise expense or capital asset G − T and a recoverable-tax asset T. Payments before the invoice are supplier advances until allocated.
- **Invoice allocation**: `vendor_invoice_allocation` (invoice_id, `kind` (payment, supplier_advance, withholding), payout_id or withholding_id, amount_paise). Outstanding = G − allocations. An amount cannot be allocated to two invoices. Status recomputation reads confirmed allocations, replacing the current comparison of approved transactions against line totals.
- **Withholding (TDS)**: `withholding` (vendor party, invoice or payment allocation, `provision` (section 393 table item), taxable_base_paise, rate_bp, amount_paise, trigger_on = earlier of credit or payment, deducted_on, lower_or_nil_basis, payee tax snapshot). A deduction made at a pre-invoice payment is not deducted again at invoice. `tax_remittance` (paid_on, account_movement_id, challan identifiers, tax year and quarter, allocations to withholdings). Remittance clears the liability and is not vendor expense.
- **Cash vouchers**: `voucher` table (fiscal_year_id, `number` FY sequence, line_item_id, attachment_id, generated_at). The number is allocated in the approval transaction and reused on PDF retry.

### 3.7 Budgets (deferred)

`budget` (fiscal_year_id, concrete FK per scope, `measure` = recognised_cost only in the first version, revision, status, approved_by) and `budget_line` (account_head_id, amount_paise). Unique approved revision per scope, fiscal year and measure. Cash-basis budgets wait for dimensioned movement allocations. Fund and programme views are alternative cuts, never summed.

### 3.8 Posting layer

```
posting
  id, source_type, source_id, source_revision, action,
  idempotency_key UNIQUE (source_type, source_id, source_revision, action),
  created_by, created_at

ledger_entry                       -- recognition
  id, posting_id, source_line_id,
  economic_on, posted_on, fiscal_period_id,
  effect (increase | decrease), amount_paise,
  account_head_id, fund_id, programme_id?, project_id?, event_id?, cost_centre_id?,
  party_id?, medium (monetary | in_kind),
  fcra_activity?, fcra_expense_class? (programme | asset | administration),
  reverses_entry_id?

account_movement                   -- cash book
  id, posting_id, org_account_id,
  occurred_on, posted_on, bank_value_on?, fiscal_period_id,
  direction (in | out), amount_paise,
  kind (receipt | payout | transfer | refund | fee | tax_remittance | opening),
  payment_reference?, transfer_id?, reverses_movement_id?

movement_allocation
  account_movement_id, document_type, document_id, amount_paise
```

Posting triggers (each row is one source action with its own source ID):

| Source action | Recognition | Movement |
|---|---|---|
| Contribution received (gateway) | income gross; fee and fee tax as expense | in (gross) to gateway clearing; fee out |
| Gateway settlement to bank | none | transfer out of clearing, in to bank |
| Contribution received (bank, UPI, cheque, cash) | income gross | in to that account |
| Other income received | income | in |
| Issued invoice sent | fee income (gross) | none |
| Issued invoice receipt confirmed | TDS receivable asset for the deducted part | in (net cash) |
| Donor refund | income decrease | refund out |
| In-kind contribution | in-kind income plus consumption expense or asset increase | none |
| Reimbursement approved | expense per line | none |
| Payout confirmed (reimbursement or vendor) | none | payout out |
| Settlement round approved | expense per settlement line | none |
| Vendor invoice accepted | expense or asset G − T; recoverable-tax asset T | none |
| Withholding deducted | none (liability on the withholding row) | none |
| Tax remittance paid | none | tax_remittance out |
| Inter-account transfer | none | linked out and in sharing `transfer_id` |
| Correction document approved | reversal plus replacement | only with evidence of a movement |
| Opening balance (cutover) | none | opening in, CA-confirmed |

Rules:

1. Append-only. No update or delete path in the product. Corrections append a reversal and a replacement from a superseding document. A classification correction never creates a movement.
2. The server mutator serialises posting against document changes, allocation limits and period closure, rechecks permissions and document state, enforces the idempotency key, and returns rejections through `handleMutationResult()`. Optimistic client state never allocates receipt or voucher numbers.
3. Posted documents and lines are frozen even in open periods. `requests.edit_all_statuses` and `resetToPending` apply only to unposted revisions.
4. Late documents keep their economic dates. Posting into a closed period requires `finance.reopen_period` and is logged; otherwise the posting date falls in the current open period.
5. `medium = in_kind` entries are excluded from cash views and labelled separately in the CA handoff; they are included in programme cost and the audit pack.
6. Adjustments need `finance.adjust` and a reason stored on the adjustment document.
7. Authenticated writes keep the existing audit boundaries: Zero commands through the central audited mutation boundary in `apps/web/src/routes/api/zero/mutate.ts`, direct server commands through `runSessionAuditedAction`. Finance actions extend the action summaries and safe-field allowlists in `apps/web/src/lib/audit.ts`; metadata carries only action IDs, entity IDs, changed field names and counts. Downstream jobs are enqueued after commit.

### 3.9 Imports and reconciliation

| Table | Key columns |
|---|---|
| `import_batch` | `source` (razorpay_api, give_do_csv, bank_csv, upi_csv), org_account_id, uploaded_by, file attachment, file_hash, parser_version, mapping (jsonb), row counts, status |
| `import_row` | batch_id, row_number, raw (jsonb, server only, short retention), raw_hash, external_identity_id, outcome (imported, linked_existing, conflict, skipped, error) |
| `external_identity` | provider, provider_account, entity_type (payment, order, refund, settlement, statement_line), external_id, exactly one target: contribution_id, account_movement_id or statement_line_id. UNIQUE on the four identity columns. Survives raw payload expiry |
| `statement_line` | org_account_id, value_on, amount_paise, direction, narration, reference, reconciliation_status |
| `statement_allocation` | statement_line_id, account_movement_id, amount_paise |

Rules:

- `external_identity` is the only identity store; contributions and import rows reference it. Strong external identity is the only automatic dedupe. Amount, date and contact fingerprints only propose candidate matches for review.
- Identical re-uploads link to the earlier result. A changed payload under the same identity becomes a conflict. Retrying a batch processes unresolved rows only. Posted contributions change through corrections, never import overwrite.
- Bank and UPI files create statement lines, which reconcile by allocation against movements. Gateway settlements, transfers and refunds never create donations. A partially allocated line stays visibly unreconciled.
- Razorpay import pulls payments, refunds and settlements separately, preserving gross, fee, tax and settlement allocation.

### 3.10 Approvals

| Table | Key columns |
|---|---|
| `approval_step` | document_type, document_id, document_revision, sequence, `step` (lead, finance), required, threshold_snapshot_paise, decided_by, decided_at, decision, note. UNIQUE (document_type, document_id, document_revision, step) |

- Every request needs programme-lead approval by a user who leads that programme (checked server-side, not only by permission ID). Finance approval is additionally required when the gross requested amount exceeds the effective threshold: the programme override if set, else `app_config.finance_threshold_default_paise`. Both are edited on the Settings page by `finance.manage`. If the claimant is the programme lead, the lead step is skipped and finance approval is required regardless of amount.
- Creator, claimant and identifiable beneficiary (payee bank account owner, vendor contact) cannot approve or confirm payment on their own request. Lead and finance decisions must be different people. An approver may also confirm the payout. Nothing approves automatically; an otherwise eligible admin may approve manually.
- `treasurer` is a seeded role holding `finance.confirm_payment`, `finance.adjust`, `finance.reopen_period`, `finance.manage` and `finance.view_sensitive`. Adjustments and period reopenings are audited actions.
- Permissions: `requests.approve` is replaced by `finance.approve_lead` and `finance.approve`. New: `finance.view`, `finance.manage`, `finance.view_sensitive`, `finance.adjust`, `finance.confirm_payment`, `finance.reopen_period`, `donors.view`, `donors.manage`. The `rolePermission` rows, the admin exclusion sets in `packages/db/src/permissions.ts`, mutators, route `beforeLoad` guards, UI `hasPermission` checks and notification recipient selection migrate together, with route guards tested for denied and allowed contexts. `requests.export` keeps its current roles.

### 3.11 Outcomes and volunteer effort (deferred)

- `event_outcome`: event_id, `unit` (child, elder, family, animal, tree, meal, kit), count, `counting_method` (service_contacts, unique_people), note. Default is service contacts; unique-people counting needs an explicit identity source.
- `team_event_member` gains `minutes` and `minutes_estimated`. Minutes count only for members marked present on a non-cancelled, materialised occurrence. `app_config` gains `volunteer_hour_value_paise`. Effort never posts.
- Donor retention = parties with positive net received giving (received or receipted, minus refunds and reversals) in both of two consecutive fiscal years, excluding intermediaries.

### 3.12 FCRA records

Added at FCRA activation, which is its own gate before any foreign contribution is accepted:

| Record | Purpose |
|---|---|
| `organisation_registration(type = fcra)` with permitted activities and States/UTs | Scope check on receipts and utilisation |
| `org_account.fcra_role` | Designated receipt account versus utilisation accounts; routing validated per movement kind |
| `party_private.foreign_source_assessment` with date and note, snapshotted on the contribution | Receipt-level classification; acceptance is blocked while the assessment or authorisation is pending |
| `contribution` original currency and conversion evidence | FC-4 receipts schedule |
| `contribution_ultimate_donor` with identity snapshot | Intermediary and donor-advised-fund disclosure |
| `ledger_entry.fcra_activity` (from the permitted list) and `fcra_expense_class`, plus `cost_centre.state_ut` | Activity-wise and project-and-location utilisation, administrative share; immutable once posted |
| `other_income(kind = asset_income)` on FCRA funds | Income derived from FCRA assets |
| `fixed_asset` register (acquiring entry, fund source, location, disposal) | Assets schedule |
| Opening cash balances per FCRA account (movements) and opening in-kind holdings (recognition) | Opening and closing balance schedule |

FC-4 preparation is a workbook built from these records plus the CA-certified statements, which remain external.

### 3.13 Exports

| Export | Source | Format |
|---|---|---|
| FY audit pack | postings with dimensions, documents, attachments, receipts, vouchers, reconciliation status | ZIP of CSV plus files; replaces `/export` |
| CA handoff | recognition entries and movements with `tally_ledger_name`, party names, document references, tax splits, in-kind labelled | CSV and XLSX; called a handoff until the CA's import path is proven |
| Form 113 statement | `donation_filing_row` | Portal column order, versioned adapter |
| Form 114 delivery | `donation_certificate` | Email through existing notification jobs |
| Local donation receipt | `receipt` | PDF via `@pi-dash/pdf`, emailed after commit |
| FC-4 workbook | section 3.12 | XLSX |
| Utilisation certificate | one grant: opening unspent, tranches, attributable `other_income`, eligible utilisation per the grant's reporting basis, grant returns, closing unspent, with advances and commitments disclosed separately; nothing inferred from account balances | PDF from funder template |
| Engagement report | one project of kind engagement: quoted budget, invoices issued, receipts, spend by account head, event outcomes, photos link | PDF for the sponsor or Goodera |
| Donor statement | one party | PDF |

## 4. Data protection

Follows the DPDP compliance guide (Documents, Proud Indian private, 8 October 2026) and its retention schedule, with retention held per record.

- Every retained finance record, attachment, receipt, filing row and import payload carries `retention_policy_version`, `retain_until`, `retention_basis` and `legal_hold`. Financial evidence keeps ten years from the end of the tax year; import payloads keep months; money-related audit rows keep ten years, others thirteen months.
- Expiry is handled by a privileged retention process, not ordinary product mutations. It preserves referential integrity for append-only books and records each disposal separately.
- An erasure request removes CRM and communication data immediately where permitted. Identifying evidence under statutory retention or legal hold stays, under restricted access, until the obligation expires; the request log records what was kept and why.
- Encrypted at rest and excluded from Zero: `party_private.id_number`, `party_bank_account.account_number`, `org_account` bank details, payee account numbers on reimbursements and legacy advance payments, filing-row donor IDs. Snapshots and attachments containing the same data are server-only and served through guarded URLs.
- `collection_event` records the processing basis and notice version per collection. A donor who paid on the Razorpay page saw that page's notice; a donor imported from a give.do CSV did not see ours, and the record says so. Receipt processing (section 7(a)) and statutory disclosure (section 7(d)) do not authorise fundraising communication; that needs its own consent purpose.
- Finance parties survive login deletion.
- Receipt and certificate PDFs and emails run after commit through `enqueue()` with `withFireAndForgetLog()` and a stable key of document ID plus revision, so a retry reuses the same receipt number.

## 5. Delivery phases

The fixed external date is **31 May 2027** for FY 2026-27 Form 113 submission and Form 114 delivery, with DPDP obligations from about 12 May 2027.

| Phase | Scope | Gate |
|---|---|---|
| 0 Contracts | Posting rules, export column contracts, bigint wire representation proof, team-to-programme mapping, CA-confirmed opening balances including vendor payables and any unsettled legacy advances, list of legacy payouts with evidence, non-overlapping historical and live posting ranges | Founder and CA sign-off |
| 1 Foundations | `bigint` paise migration, party and server-only tables with the Zero sync allowlist, vendor migration, dimensions, `programme_id` on events, organisation registrations, cascade removal and export join fix | Types, migrations, Zero schema, seeds |
| 2 Donor capture (staging) | contribution and `other_income` as draft or imported records, Razorpay API import, CSV import with `external_identity`, statement lines, filing readiness view. No receipt numbers or postings until Phase 3 | Monthly imports running |
| 3 Posting controls and activation | payout records, minimum vendor invoice recognition with allocations and withholding capture, frozen revisions and supersession, approval steps, posting with idempotency, period closure, reconciliation allocations, receipt numbering. Ledger activated at cutover with CA opening balances; backfill only evidence-backed facts | Cutover |
| 4 Filing | Form 113 export with filing tracking, submission and acknowledgement, Form 114 receipt and delivery, local receipts, FY audit pack, CA handoff | Submitted and delivered before 31 May 2027 |
| 5 Learning and controls | GST components, tax remittance, budgets, grant allocations and utilisation certificates, event outcomes, volunteer minutes, pledges, campaigns, dashboards | After the filing deadline |
| 6 FCRA | section 3.12 records, routing validation, FC-4 workbook | Before the first foreign contribution |
| DPDP (parallel with 1 to 4) | encryption, retention columns and privileged expiry process, collection events, rights-request log | 12 May 2027 |

Each phase ships with migrations, idempotent seeds in `scripts/seed.ts`, Zero schema regeneration, permission changes with `rolePermission` migration, and E2E coverage for the state machines.

## 6. Founder answers (13 October 2026)

| Question | Answer |
|---|---|
| Team to programme mapping | Confirmed by the founder on 14 October 2026 as applied by migration 0114. The two manual retags are approved for the Phase 0 script: the Mumbai-tagged spoken-English cupboard donation moves to Community support; the JP Morgan and IDFC school transformation, STEM and maths-kit engagements move to Education |
| Legacy requests without an event | The Phase 0 script assigns the submitter's team programme where the submitter is in exactly one team; the rest stay on Unallocated for finance to clear |
| Lead as claimant | The lead step is skipped and finance approves regardless of amount |
| Moving an event between programmes | A team lead may change it until a reimbursement or vendor payment links to the event; after that only `finance.manage` can |
| New fiscal years | A scheduled pg-boss job each January creates the next April-to-March year and its periods |
| Account head ledger names | Use the pi-dash names as they are; the CA keys from what pi-dash provides and keeps no separate system |
| CA handoff | XLSX workbook only; no Tally XML |
| Finance threshold | Configurable in Settings; organisation default with per-programme override. Lead-as-claimant goes to finance |
| Finance roles | One treasurer role; approver may also pay; claimant never approves or pays their own request |
| give.do | Intermediary only; we issue receipts and file each donor |
| Restricted gifts | None today |
| First release scope | In-kind as consumed, grants as contributions only; asset register and utilisation certificates in Phase 5 |
| Utilisation certificate format | Cash spent only |
| Cost per beneficiary | Service contacts |
| Ownership before May 2027 | Founder |
| CA handoff | XLSX workbook |
| Goodera | Pays against our invoice; it is an intermediary party on the engagement project |
| Direct corporates | CSR grant under agreement, or sponsorship against our invoice; each engagement has a quoted budget and expects a report |
| Mumbai | Chapter closed; it ran on volunteers plus one contractor paid per event, a pattern Bangalore may repeat |

## 7. Team to programme mapping (proposed from production, 13 October 2026)

Production has six teams. Counts are events and members at the time of reading.

| Team today | Events | Programme (cause) | Projects under it | Notes |
|---|---|---|---|---|
| Gubbachi Art Class Team | 26 | Education | "Gubbachi art class 2026-27" (kind class) | Partner centre Gubbachi |
| Gubbachi Maths Class Team | 25 | Education | "Gubbachi maths class 2026-27" (kind class) | |
| PI Center Spoken English Class Team | 31 | Education | "PI Center spoken English 2026-27" (kind class) | One Mumbai-tagged event is a cupboard donation to a school via Ethos; retag to the Community support programme |
| Kalakriti 3.0 Team | 39 | Arts and culture | "Kalakriti 3.0" (kind edition), one project per edition | Kalakriti editions link to their project |
| Core Team | 9 | Community support | Drives as projects of kind drive: gift distribution, laptop distribution, solar power banks, Prani visit | The catch-all for distributions and outings |
| Mumbai Team | 90 | Split by cause, one engagement project per sponsor and activity | Education (school transformation, STEM and maths kits with IDFC and JP Morgan); Community support (art with elderly, beach clean-ups, eco wash, ration kits, Bags of Hope) | Cost centre Mumbai, inactive. Sponsors become parties with role sponsor; Goodera is an intermediary party where it sourced the engagement |

Programmes to seed: Education, Arts and culture, Community support. Elder care and environment activities fold into Community support. Teams keep their names as volunteer groups and get `programme_id` from this table; the Mumbai Team gets Community support as its default and its events are retagged per project in the Phase 0 mapping script.

Backfill facts from production that shape Phase 0:

- 160 of 294 reimbursements and 13 of 24 vendor payments have no event. The mapping script assigns a programme from the submitter's team where unambiguous and otherwise tags them to a seeded "Unallocated" programme that finance must clear before year close.
- Advance payments: 19 approved, all legacy.
- Expense categories in use: Resource Cost, Procurement, Transportation, Others, Food or Refreshment, Logistics, Scholarship (unused). These become account heads under one expense parent with Tally ledger names supplied by the CA.

## 8. Remaining open items

1. Fiscal years: the `ensure-fiscal-years` job runs on the 1st of every month and keeps the current and next April-to-March year present with their periods, so a year exists from the April a year before it starts. Closed.
2. Engagement receipts are donations, not fee income. The audited statements for 2023-24, 2024-25 and 2025-26 (GVNKA & Associates) show all income under "Donations received" with no service or fee line, and the accounting policy recognises donations on receipt. So Goodera and corporate engagement money enters as `contribution` with `donation_type = csr` (direct corporate) or `other` (via Goodera) and a sponsor on the engagement project. `issued_invoice` is kept only as the document the sponsor asks for before paying; it does not recognise income, and the receivables rows in section 3.4 and the posting table are downgraded to "acknowledgement sent, no posting until the contribution is received". The section 12AB incidental-business question therefore does not arise unless the CA changes the treatment.
3. GST: not needed as of now (founder, 14 October 2026). Issued acknowledgements carry no GST; vendor invoices still record the GST vendors charge us. Revisit only if the trust starts making taxable supplies.
