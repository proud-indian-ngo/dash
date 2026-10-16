export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_AVATAR_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ATTACHMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_SCHEDULED_MESSAGE_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_APPROVAL_SCREENSHOT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_KALAKRITI_MUSIC_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_KALAKRITI_MUSIC_FILES = 2;
export const MAX_KALAKRITI_SCORECARD_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_KALAKRITI_SCORECARD_FILES = 10;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/quicktime",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MIME_TYPE_PATTERN =
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export const ALLOWED_APPROVAL_SCREENSHOT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_EVENT_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "video/mp4",
  "video/quicktime",
] as const;

export const ALLOWED_KALAKRITI_MUSIC_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
] as const;
export type AllowedKalakritiMusicMimeType =
  (typeof ALLOWED_KALAKRITI_MUSIC_TYPES)[number];

export const ALLOWED_KALAKRITI_SCORECARD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
export type AllowedKalakritiScorecardMimeType =
  (typeof ALLOWED_KALAKRITI_SCORECARD_TYPES)[number];

export const cityValues = ["bangalore", "mumbai"] as const;
export type City = (typeof cityValues)[number];

export const attachmentTypeValues = ["file", "url"] as const;
export type AttachmentType = (typeof attachmentTypeValues)[number];

export const historyActionValues = [
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "invoice_submitted",
  "invoice_updated",
  "invoice_approved",
  "invoice_rejected",
  "voided",
] as const;
export type HistoryAction = (typeof historyActionValues)[number];

/** Why a paid vendor payment closes without a vendor invoice. */
export const vendorPaymentNoInvoiceReasonValues = [
  "rent",
  "statutory",
  "other",
] as const;
export type VendorPaymentNoInvoiceReason =
  (typeof vendorPaymentNoInvoiceReasonValues)[number];

/**
 * Which work an expense served: an event (its programme comes from the
 * event), a programme or project without an event, or running the
 * organisation itself (admin).
 */
export const expenseChargedToValues = [
  "event",
  "programme",
  "organisation",
] as const;
export type ExpenseChargedTo = (typeof expenseChargedToValues)[number];

export const reminderTargetValues = ["participants", "group", "both"] as const;
export type ReminderTarget = (typeof reminderTargetValues)[number];

// ── Finance dimensions ──────────────────────────────────────────────────────

export const projectKindValues = [
  "class",
  "edition",
  "drive",
  "engagement",
  "other",
] as const;
export type ProjectKind = (typeof projectKindValues)[number];

export const projectStatusValues = ["planned", "active", "closed"] as const;
export type ProjectStatus = (typeof projectStatusValues)[number];

export const fundSourceValues = ["domestic", "fcra"] as const;
export type FundSource = (typeof fundSourceValues)[number];

export const fundRestrictionValues = [
  "unrestricted",
  "restricted",
  "designated",
] as const;
export type FundRestriction = (typeof fundRestrictionValues)[number];

/**
 * `fund` heads carry fund balances (the trust's equity, such as the opening
 * Corpus and General Fund balances); the fund itself is the entry's fund_id.
 */
export const accountHeadTypeValues = [
  "income",
  "expense",
  "asset",
  "liability",
  "fund",
] as const;
export type AccountHeadType = (typeof accountHeadTypeValues)[number];

/**
 * `deposit` is a fixed deposit: it gets money only by transfer from or to
 * the current account, never takes donations or bank statement imports, and
 * its interest is other income.
 */
export const orgAccountKindValues = [
  "bank",
  "cash",
  "gateway_clearing",
  "deposit",
] as const;
export type OrgAccountKind = (typeof orgAccountKindValues)[number];

export const fcraRoleValues = ["none", "receipt", "utilisation"] as const;
export type FcraRole = (typeof fcraRoleValues)[number];

export const organisationRegistrationTypeValues = [
  "pan",
  "tan",
  "12ab",
  "80g",
  "fcra",
  "csr1",
  "darpan",
] as const;
export type OrganisationRegistrationType =
  (typeof organisationRegistrationTypeValues)[number];

/** Fixed IDs for reference rows created by migration and seed. */
export const PROGRAMME_IDS = {
  artsAndCulture: "01930000-0000-7000-8000-000000000002",
  communitySupport: "01930000-0000-7000-8000-000000000003",
  education: "01930000-0000-7000-8000-000000000001",
  unallocated: "01930000-0000-7000-8000-000000000009",
} as const;

export const COST_CENTRE_IDS = {
  bangalore: "01930000-0000-7000-8000-000000000101",
  mumbai: "01930000-0000-7000-8000-000000000102",
} as const;

export const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";

/** Restricted corpus fund; created by the ledger reference data. */
export const CORPUS_FUND_ID = "01930000-0000-7000-8000-000000000202";

/** Account heads the books need from day one (ledger reference data). */
export const LEDGER_ACCOUNT_HEAD_IDS = {
  auditFeesPayable: "01930000-0000-7000-8000-000000000802",
  corpusDonations: "01930000-0000-7000-8000-000000000810",
  donationsReceived: "01930000-0000-7000-8000-000000000805",
  /**
   * Parent of the expense heads made from the expense categories (layer
   * 3-3a). It once shared `corpusDonations`' ID by mistake; the reference
   * data repairs databases made then (`repairExpensesParent`).
   */
  expenses: "01930000-0000-7000-8000-000000000812",
  fdInterest: "01930000-0000-7000-8000-000000000804",
  fixedAssets: "01930000-0000-7000-8000-000000000801",
  fundBalance: "01930000-0000-7000-8000-000000000803",
  gatewayCharges: "01930000-0000-7000-8000-000000000808",
  inKindConsumed: "01930000-0000-7000-8000-000000000807",
  inKindDonations: "01930000-0000-7000-8000-000000000806",
  otherIncome: "01930000-0000-7000-8000-000000000809",
  /** Vendor payments made before their invoice is accepted (layer 3-3a). */
  supplierAdvances: "01930000-0000-7000-8000-000000000811",
  /** Bank debits marked as bank charges on the statement (layer 3-3b). */
  bankCharges: "01930000-0000-7000-8000-000000000820",
  /** Bank debits marked as a tax or government fee payment (layer 3-3b). */
  taxesAndFees: "01930000-0000-7000-8000-000000000821",
  /**
   * Approved reimbursements not yet paid, by date (layer 3-3b): the
   * approval raises it, each payment out of the bank clears its part, so
   * the books balance on every day between the two. A payment before the
   * approval leaves it negative in between, as an advance to the claimant.
   */
  claimsPayable: "01930000-0000-7000-8000-000000000830",
  /**
   * Audited figures (the year-end true-up): a fixed asset the CA's
   * statements carry at less than the books, as depreciation.
   */
  depreciation: "01930000-0000-7000-8000-000000000840",
  /**
   * Audited figures: the other side of every other year-end correction the
   * CA made (a provision written back, a new provision, an asset written
   * up), unless the treasurer picks another income or expense head.
   */
  yearEndAdjustments: "01930000-0000-7000-8000-000000000841",
  /** Audited figures: money the CA moved from one fund to another. */
  fundTransfers: "01930000-0000-7000-8000-000000000842",
} as const;

/**
 * Fund heads that take capital receipts during the year: a corpus gift is
 * credited straight to the Corpus Fund under `corpusDonations`, outside
 * income and expenditure. The balance views show these entries as the
 * fund's additions during the year; other fund heads (the opening fund
 * balances) are part of the fund's opening.
 */
export const CAPITAL_RECEIPT_HEAD_IDS: readonly string[] = [
  LEDGER_ACCOUNT_HEAD_IDS.corpusDonations,
];

/**
 * Fund heads whose entries during the year are a fund's movement of the
 * year rather than part of its opening: capital receipts, and transfers
 * between funds the audited figures post. Only the capital receipts are
 * listed apart in the CA workbook's summary.
 */
export const FUND_MOVEMENT_HEAD_IDS: readonly string[] = [
  ...CAPITAL_RECEIPT_HEAD_IDS,
  LEDGER_ACCOUNT_HEAD_IDS.fundTransfers,
];

/**
 * GiveIndia, which runs give.do and passes its donors' gifts on: recorded as
 * the intermediary of every give.do contribution, never as the giver.
 * Created by the first give.do import and by the seed.
 */
export const GIVE_INDIA_PARTY_ID = "01930000-0000-7000-8000-000000000401";
export const GIVE_INDIA_PARTY_NAME = "GiveIndia (give.do)";

export const FISCAL_YEAR_IDS = {
  "2024-25": "01930000-0000-7000-8000-000000000301",
  "2025-26": "01930000-0000-7000-8000-000000000302",
  "2026-27": "01930000-0000-7000-8000-000000000303",
  "2027-28": "01930000-0000-7000-8000-000000000304",
} as const;

/** Upper bound for any paise value crossing the JavaScript boundary. */
export const MAX_PAISE = Number.MAX_SAFE_INTEGER;

/** Default finance-approval threshold when no programme override is set. */
export const APP_CONFIG_FINANCE_THRESHOLD_KEY =
  "finance_threshold_default_paise";
export const DEFAULT_FINANCE_THRESHOLD_PAISE = 10_000_00;

// ── Parties ─────────────────────────────────────────────────────────────────

export const partyKindValues = ["person", "organisation"] as const;
export type PartyKind = (typeof partyKindValues)[number];

export const partyRoleValues = [
  "donor",
  "sponsor",
  "grantor",
  "intermediary",
  "vendor",
  "volunteer",
  "judge",
  "partner",
] as const;
export type PartyRole = (typeof partyRoleValues)[number];

/** Roles the donor directory manages; other roles come from their own workflows. */
export const directoryRoleValues = [
  "donor",
  "sponsor",
  "grantor",
  "intermediary",
] as const;
export type DirectoryRole = (typeof directoryRoleValues)[number];

/** Identity types the donation statement (Form 113) accepts, plus none. */
export const partyIdTypeValues = [
  "pan",
  "passport",
  "voter_id",
  "driving_licence",
  "ration_card",
  "tax_id_foreign",
  "none",
] as const;
export type PartyIdType = (typeof partyIdTypeValues)[number];

export const foreignSourceAssessmentValues = [
  "domestic",
  "foreign",
  "pending",
] as const;
export type ForeignSourceAssessment =
  (typeof foreignSourceAssessmentValues)[number];

/**
 * Donor details an import may add to an existing donor where the donor has
 * none: the ID number, the address (all of its lines together), email and
 * phone. Stored values are never replaced.
 */
export const partyFillFieldValues = [
  "idNumber",
  "address",
  "email",
  "phone",
] as const;
export type PartyFillField = (typeof partyFillFieldValues)[number];

/**
 * Start of the error a party save throws when someone else saved the record
 * first; the client matches it to reload the form.
 */
export const PARTY_SAVE_CONFLICT_PREFIX = "Someone else changed";

// ── Income ──────────────────────────────────────────────────────────────────

/** How a contribution reached the trust. */
export const contributionChannelValues = [
  "razorpay",
  "give_do",
  "upi",
  "neft",
  "cheque",
  "cash",
  "in_kind",
] as const;
export type ContributionChannel = (typeof contributionChannelValues)[number];

/** Mode of receipt as the donation statement (Form 113) lists it. */
export const contributionReportingModeValues = [
  "cash",
  "electronic_or_account_payee",
  "in_kind",
  "other",
] as const;
export type ContributionReportingMode =
  (typeof contributionReportingModeValues)[number];

/** Donation type as the donation statement (Form 113) lists it. */
export const donationTypeValues = [
  "corpus",
  "voluntary",
  "specific_grant",
  "csr",
  "other",
] as const;
export type DonationType = (typeof donationTypeValues)[number];

export const deductionEligibleValues = ["yes", "no", "unknown"] as const;
export type DeductionEligible = (typeof deductionEligibleValues)[number];

export const contributionStatusValues = [
  "pending",
  "received",
  "receipted",
  "refunded",
  "reversed",
] as const;
export type ContributionStatus = (typeof contributionStatusValues)[number];

export const contributionSourceValues = ["manual", "import"] as const;
export type ContributionSource = (typeof contributionSourceValues)[number];

/** Where a refund of a contribution came from; manual entry comes later. */
export const contributionRefundSourceValues = ["razorpay", "manual"] as const;
export type ContributionRefundSource =
  (typeof contributionRefundSourceValues)[number];

/** Who paid a gateway settlement out of its clearing balance. */
export const gatewaySettlementProviderValues = ["razorpay", "give_do"] as const;
export type GatewaySettlementProvider =
  (typeof gatewaySettlementProviderValues)[number];

/** Razorpay's settlement states; `processed` means the bank transfer was started. */
export const gatewaySettlementStatusValues = [
  "created",
  "processed",
  "failed",
] as const;
export type GatewaySettlementStatus =
  (typeof gatewaySettlementStatusValues)[number];

/** What a settlement line settled, as Razorpay's settlement recon reports it. */
export const gatewaySettlementItemTypeValues = [
  "payment",
  "refund",
  "transfer",
  "adjustment",
] as const;
export type GatewaySettlementItemType =
  (typeof gatewaySettlementItemTypeValues)[number];

/** Income that is not a donation and never enters donation filings. */
export const otherIncomeKindValues = [
  "interest",
  "grant_return",
  "asset_income",
  "misc",
] as const;
export type OtherIncomeKind = (typeof otherIncomeKindValues)[number];

// ── Imports ─────────────────────────────────────────────────────────────────

/**
 * Where an import batch came from. `razorpay_api` batches are opened by the
 * Razorpay webhook, one per India day. `bank_csv` batches are bank
 * statements: their rows become statement lines, never donations directly.
 */
export const importBatchSourceValues = [
  "give_do_payout",
  "give_do_csv",
  "generic_csv",
  "razorpay_api",
  "bank_csv",
] as const;
export type ImportBatchSource = (typeof importBatchSourceValues)[number];

/**
 * draft: uploaded, not reviewed. reviewed: mapping saved and checked.
 * importing: a run is writing rows. completed: a run finished (some rows may
 * still be unresolved). failed: a run stopped part-way. expired: never
 * imported, and its rows were deleted by the retention job.
 */
export const importBatchStatusValues = [
  "draft",
  "reviewed",
  "importing",
  "completed",
  "failed",
  "expired",
] as const;
export type ImportBatchStatus = (typeof importBatchStatusValues)[number];

export const importRowOutcomeValues = [
  "pending",
  "imported",
  "linked_existing",
  "conflict",
  "skipped",
  "error",
] as const;
export type ImportRowOutcome = (typeof importRowOutcomeValues)[number];

/** Who issued an external ID; `generic` covers spreadsheets with no provider. */
export const externalIdentityProviderValues = [
  "give_do",
  "generic",
  "razorpay",
] as const;
export type ExternalIdentityProvider =
  (typeof externalIdentityProviderValues)[number];

/** A payment became a contribution; a refund was applied to one. */
export const externalIdentityEntityTypeValues = ["payment", "refund"] as const;
export type ExternalIdentityEntityType =
  (typeof externalIdentityEntityTypeValues)[number];

// ── Bank statements ─────────────────────────────────────────────────────────

/** Money into the account (credit) or out of it (debit), as the bank prints it. */
export const statementLineDirectionValues = ["credit", "debit"] as const;
export type StatementLineDirection =
  (typeof statementLineDirectionValues)[number];

/**
 * unmatched: nothing explains the line yet (it may carry a suggestion).
 * matched: tied to what explains it. ignored: set aside with a reason.
 */
export const statementLineMatchStatusValues = [
  "unmatched",
  "matched",
  "ignored",
] as const;
export type StatementLineMatchStatus =
  (typeof statementLineMatchStatusValues)[number];

/**
 * What a matched line is: a gateway settlement paid out to the bank, a
 * contribution deposited straight into it, a give.do (GiveIndia) payout, a
 * transfer between the trust's own accounts, money out explained in full by
 * its allocations (`expense`: reimbursements, vendor payments, bank charges
 * and taxes, layer 3-3b), or something else (older debit marks).
 */
export const statementLineMatchKindValues = [
  "settlement",
  "contribution",
  "giveindia_payout",
  "transfer",
  "other",
  "expense",
] as const;
export type StatementLineMatchKind =
  (typeof statementLineMatchKindValues)[number];

/** Why a line was matched or suggested; a short code, never line content. */
export const statementLineMatchReasonValues = [
  "utr",
  "reference",
  "amount_date",
  "giveindia_narration",
  "manual",
] as const;
export type StatementLineMatchReason =
  (typeof statementLineMatchReasonValues)[number];

/**
 * What part of a bank debit pays for (layer 3-3b, `statement_allocation`):
 * an approved reimbursement, an approved vendor payment, or no document at
 * all: bank charges, or a tax or government fee.
 */
export const statementAllocationKindValues = [
  "reimbursement",
  "vendor_payment_transaction",
  "bank_charges",
  "tax_payment",
] as const;
export type StatementAllocationKind =
  (typeof statementAllocationKindValues)[number];

/** The allocation kinds that pay a document (a claim or a vendor payment). */
export const STATEMENT_DOCUMENT_ALLOCATION_KINDS = [
  "reimbursement",
  "vendor_payment_transaction",
] as const satisfies readonly StatementAllocationKind[];
export type StatementDocumentAllocationKind =
  (typeof STATEMENT_DOCUMENT_ALLOCATION_KINDS)[number];

/** Why a line was set aside. */
export const statementLineIgnoreReasonValues = [
  "bank_interest",
  "reversal",
  "not_ours",
  "other",
] as const;
export type StatementLineIgnoreReason =
  (typeof statementLineIgnoreReasonValues)[number];

/** DPDP Act processing basis for a collection of personal data. */
export const processingBasisValues = [
  "consent",
  "voluntary_provision_7a",
  "legal_disclosure_7d",
] as const;
export type ProcessingBasis = (typeof processingBasisValues)[number];
