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
export const VOUCHER_AMOUNT_THRESHOLD = 1000;
export const VOUCHER_AMOUNT_THRESHOLD_PAISE = VOUCHER_AMOUNT_THRESHOLD * 100;

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
] as const;
export type HistoryAction = (typeof historyActionValues)[number];

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

export const accountHeadTypeValues = [
  "income",
  "expense",
  "asset",
  "liability",
] as const;
export type AccountHeadType = (typeof accountHeadTypeValues)[number];

export const orgAccountKindValues = [
  "bank",
  "cash",
  "gateway_clearing",
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

/** Income that is not a donation and never enters donation filings. */
export const otherIncomeKindValues = [
  "interest",
  "grant_return",
  "asset_income",
  "misc",
] as const;
export type OtherIncomeKind = (typeof otherIncomeKindValues)[number];
