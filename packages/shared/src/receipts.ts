/**
 * Donation receipts issued by pi-dash. One place holds who receipts which
 * gift, the receipting start date, the number format, the receipt wording
 * and the rules that decide whether a gift can be receipted, so the server,
 * the Income page and the PDF agree.
 *
 * Policy (founder, 14 October 2026): Razorpay Payment Pages and give.do
 * already send their own 80G receipts (give.do under Proud Indian's own
 * registration), so pi-dash never receipts those gifts. pi-dash receipts
 * direct gifts only (UPI, NEFT/IMPS, cheque, and cash should it ever
 * happen) received on or after 1 April 2026; earlier gifts were receipted
 * outside pi-dash.
 */
import type {
  ContributionChannel,
  ContributionReportingMode,
  DeductionEligible,
  DonationType,
  PartyIdType,
} from "./constants";
import {
  CASH_DEDUCTION_LIMIT_PAISE,
  effectiveReportingMode,
  isPlatformIntermediary,
  type ReturnDonorFacts,
} from "./donations-return";
import { INCOME_PERMISSIONS } from "./income";

/** Gifts received before this day were receipted outside pi-dash. */
export const RECEIPTING_START_DAY = "2026-04-01";
export const RECEIPTING_START_LABEL = "1 April 2026";

/** Who sends the receipt for a channel's gifts. */
export type ReceiptIssuer = "razorpay" | "give_do" | "pi_dash";

export const RECEIPT_ISSUER_LABELS: Record<ReceiptIssuer, string> = {
  give_do: "give.do",
  pi_dash: "pi-dash",
  razorpay: "Razorpay",
};

/** The fixed policy, as Settings shows it. */
export const RECEIPT_ISSUER_POLICY: readonly {
  channels: string;
  issuer: ReceiptIssuer;
  note: string;
}[] = [
  {
    channels: "Razorpay",
    issuer: "razorpay",
    note: "Razorpay Payment Pages email the 80G receipt.",
  },
  {
    channels: "give.do",
    issuer: "give_do",
    note: "give.do sends the receipt under the trust's 80G registration.",
  },
  {
    channels: "UPI, NEFT/IMPS, cheque, cash",
    issuer: "pi_dash",
    note: `Issued from Income for gifts received on or after ${RECEIPTING_START_LABEL}.`,
  },
];

/** Channels whose gifts pi-dash receipts. Cash is treated as direct. */
export const DIRECT_RECEIPT_CHANNELS: readonly ContributionChannel[] = [
  "upi",
  "neft",
  "cheque",
  "cash",
];

/** Who receipts a channel's gifts; null for in-kind gifts, which nobody receipts here. */
export function receiptIssuerFor(
  channel: ContributionChannel
): ReceiptIssuer | null {
  if (channel === "razorpay" || channel === "give_do") {
    return channel;
  }
  return DIRECT_RECEIPT_CHANNELS.includes(channel) ? "pi_dash" : null;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export const RECEIPT_NUMBER_PREFIX = "PI";

/** "PI/2026-27/0001": one gap-free series per financial year of issue. */
export function formatReceiptNumber(
  fiscalYearLabel: string,
  sequence: number
): string {
  if (!(Number.isInteger(sequence) && sequence > 0)) {
    throw new Error(`Invalid receipt sequence: ${sequence}`);
  }
  return `${RECEIPT_NUMBER_PREFIX}/${fiscalYearLabel}/${String(sequence).padStart(4, "0")}`;
}

/** The PDF's file name: the number with slashes replaced, so it is one path segment. */
export function receiptFileName(number: string): string {
  return `${number.replace(/[/\\]/g, "-")}.pdf`;
}

// ── Wording (CA to confirm) ─────────────────────────────────────────────────

/**
 * CA TO CONFIRM: the 80G eligibility line printed on receipts whose gift is
 * deductible. The 2025 Act renumbers sections; the section label comes from
 * the 80G registration in Settings so it changes in one place.
 */
export function receipt80GLine(registration: {
  sectionCode: string;
  urn: string;
  urnIssuedOn: string;
}): string {
  return `This donation is eligible for deduction under ${registration.sectionCode} of the Income-tax Act, as per Unique Registration Number ${registration.urn} dated ${formatReceiptDate(registration.urnIssuedOn)}.`;
}

/** CA TO CONFIRM: the note about the annual certificate. */
export const RECEIPT_CERTIFICATE_NOTE =
  "The certificate of donation (Form 114, formerly Form 10BE) will be issued after the trust files its annual statement of donations (Form 113).";

/** CA TO CONFIRM: printed instead of the 80G line when the gift is not claimed. */
export const RECEIPT_NO_DEDUCTION_NOTE =
  "No tax deduction certificate is issued for this donation.";

export const RECEIPT_TITLE = "Donation receipt";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-04-07" as "7 Apr 2026". */
export function formatReceiptDate(isoDay: string): string {
  const [year, month, day] = isoDay.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export const RECEIPT_MODE_LABELS: Record<ContributionChannel, string> = {
  cash: "Cash",
  cheque: "Cheque",
  give_do: "give.do",
  in_kind: "In kind",
  neft: "NEFT/IMPS",
  razorpay: "Razorpay",
  upi: "UPI",
};

/** What the receipt says the gift was for. */
export const RECEIPT_DONATION_TYPE_WORDING: Record<DonationType, string> = {
  corpus: "Corpus donation",
  csr: "CSR contribution",
  other: "Donation",
  specific_grant: "Donation for a specific purpose",
  voluntary: "Voluntary donation",
};

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * The organisation's particulars every receipt carries, kept in app_config
 * and edited by finance.manage. The 80G URN and its date come from the
 * donations return registration (`donations_return_registration`).
 */
export interface ReceiptSettings {
  orgAddress: string;
  orgName: string;
  orgPan: string;
  signatoryDesignation: string;
  signatoryName: string;
}

export const RECEIPT_SETTINGS_CONFIG_KEY = "donation_receipt_settings";
export const RECEIPT_SETTINGS_TEXT_MAX = 120;
export const RECEIPT_SETTINGS_ADDRESS_MAX = 300;

const ORG_PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Reads stored settings; null when missing or malformed. */
export function parseReceiptSettings(
  value: string | null | undefined
): ReceiptSettings | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<Record<string, unknown>>;
    const text = (key: keyof ReceiptSettings, max: number) => {
      const raw = parsed[key];
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      return trimmed && trimmed.length <= max ? trimmed : null;
    };
    const orgName = text("orgName", RECEIPT_SETTINGS_TEXT_MAX);
    const orgAddress = text("orgAddress", RECEIPT_SETTINGS_ADDRESS_MAX);
    const orgPan = text("orgPan", 10)?.toUpperCase() ?? null;
    const signatoryName = text("signatoryName", RECEIPT_SETTINGS_TEXT_MAX);
    const signatoryDesignation = text(
      "signatoryDesignation",
      RECEIPT_SETTINGS_TEXT_MAX
    );
    if (
      !(
        orgName &&
        orgAddress &&
        orgPan &&
        ORG_PAN_PATTERN.test(orgPan) &&
        signatoryName &&
        signatoryDesignation
      )
    ) {
      return null;
    }
    return {
      orgAddress,
      orgName,
      orgPan,
      signatoryDesignation,
      signatoryName,
    };
  } catch {
    return null;
  }
}

export function serializeReceiptSettings(value: ReceiptSettings): string {
  return JSON.stringify({
    orgAddress: value.orgAddress.trim(),
    orgName: value.orgName.trim(),
    orgPan: value.orgPan.trim().toUpperCase(),
    signatoryDesignation: value.signatoryDesignation.trim(),
    signatoryName: value.signatoryName.trim(),
  });
}

export function isValidOrgPan(value: string): boolean {
  return ORG_PAN_PATTERN.test(value.trim().toUpperCase());
}

// ── Eligibility ─────────────────────────────────────────────────────────────

/** Why pi-dash doesn't receipt a gift at all. */
export const receiptSkipValues = [
  "in_kind",
  "before_start",
  "pending",
  "refunded",
  "reversed",
] as const;
export type ReceiptSkip = (typeof receiptSkipValues)[number];

export const RECEIPT_SKIP_LABELS: Record<ReceiptSkip, string> = {
  before_start: `Received before ${RECEIPTING_START_LABEL} (receipted outside pi-dash)`,
  in_kind: "In kind (not receipted)",
  pending: "Not received yet",
  refunded: "Refunded",
  reversed: "Reversed",
};

/** What must be fixed before a receipt can be issued. */
export const receiptBlockValues = [
  "status_mismatch",
  "refund_recorded",
  "foreign_currency",
  "intermediary_as_donor",
  "missing_name",
  "missing_address",
  "missing_id",
  "invalid_id",
] as const;
export type ReceiptBlock = (typeof receiptBlockValues)[number];

export const RECEIPT_BLOCK_LABELS: Record<ReceiptBlock, string> = {
  foreign_currency: "Foreign currency (FCRA is not activated)",
  intermediary_as_donor: "Donation platform recorded as the donor",
  invalid_id: "Donor's ID number doesn't look valid",
  missing_address: "Donor has no address with PIN code",
  missing_id: "Donor has no ID number (needed for the 80G line)",
  missing_name: "Donor has no name",
  refund_recorded: "A refund is recorded against it",
  status_mismatch: "Marked receipted without a receipt",
};

/** What the receipt rules need to know about a gift. */
export interface ReceiptGiftFacts {
  amountPaise: number;
  channel: ContributionChannel;
  currency: string;
  deductionEligible: DeductionEligible;
  /** Whether a receipt that is not voided exists. */
  hasActiveReceipt: boolean;
  partyId: string;
  /** yyyy-MM-dd. */
  receivedOn: string;
  refundedPaise: number;
  reportingMode: ContributionReportingMode;
  status: string;
}

export type ReceiptDonorFacts = Pick<
  ReturnDonorFacts,
  "hasAddress" | "hasIdNumber" | "hasName" | "idType" | "idValid"
> & { taxCertificateOptOut: boolean };

export type ReceiptAssessment =
  | { issuer: "razorpay" | "give_do"; kind: "external" }
  | { kind: "receipted" }
  | { kind: "skipped"; reason: ReceiptSkip }
  | { kind: "eligible"; with80G: boolean }
  | { blocks: ReceiptBlock[]; kind: "blocked"; with80G: boolean };

/**
 * Whether the receipt carries the 80G line. Decision: a donor who opted out
 * of the tax certificate, or a gift marked Exclude, still gets a receipt,
 * without the 80G line and without the donor's ID; so does a cash gift
 * above the cash limit, which earns no deduction.
 */
export function receiptCarries80G(
  gift: Pick<
    ReceiptGiftFacts,
    "amountPaise" | "channel" | "deductionEligible" | "reportingMode"
  >,
  donor: Pick<ReceiptDonorFacts, "taxCertificateOptOut"> | undefined
): boolean {
  if (
    effectiveReportingMode(gift) === "cash" &&
    gift.amountPaise > CASH_DEDUCTION_LIMIT_PAISE
  ) {
    return false;
  }
  if (gift.deductionEligible === "no") {
    return false;
  }
  if (gift.deductionEligible === "yes") {
    return true;
  }
  return !donor?.taxCertificateOptOut;
}

/**
 * Where a gift stands for a pi-dash receipt. Order matters: who receipts
 * the channel, then an existing receipt, then the start date and status,
 * then what must be fixed on the gift or the donor.
 */
export function assessReceipt(
  gift: ReceiptGiftFacts,
  donor: ReceiptDonorFacts | undefined
): ReceiptAssessment {
  const issuer = receiptIssuerFor(gift.channel);
  if (issuer === "razorpay" || issuer === "give_do") {
    return { issuer, kind: "external" };
  }
  if (issuer === null) {
    return { kind: "skipped", reason: "in_kind" };
  }
  if (gift.hasActiveReceipt) {
    return { kind: "receipted" };
  }
  if (gift.receivedOn < RECEIPTING_START_DAY) {
    return { kind: "skipped", reason: "before_start" };
  }
  if (gift.status === "pending") {
    return { kind: "skipped", reason: "pending" };
  }
  if (gift.status === "refunded") {
    return { kind: "skipped", reason: "refunded" };
  }
  if (gift.status === "reversed") {
    return { kind: "skipped", reason: "reversed" };
  }
  const with80G = receiptCarries80G(gift, donor);
  const blocks: ReceiptBlock[] = [];
  if (gift.status !== "received") {
    blocks.push("status_mismatch");
  }
  // A receipt states the amount given; a partial refund makes that wrong.
  if (gift.refundedPaise > 0) {
    blocks.push("refund_recorded");
  }
  if (gift.currency.trim().toUpperCase() !== "INR") {
    blocks.push("foreign_currency");
  }
  if (isPlatformIntermediary(gift.partyId)) {
    blocks.push("intermediary_as_donor");
  }
  if (!donor?.hasName) {
    blocks.push("missing_name");
  }
  if (!donor?.hasAddress) {
    blocks.push("missing_address");
  }
  if (with80G) {
    if (!(donor && donor.idType !== "none" && donor.hasIdNumber)) {
      blocks.push("missing_id");
    } else if (donor.idValid === false) {
      blocks.push("invalid_id");
    }
  }
  return blocks.length > 0
    ? { blocks, kind: "blocked", with80G }
    : { kind: "eligible", with80G };
}

/** One line for the contribution sheet and the review dialog. */
export function receiptAssessmentLabel(assessment: ReceiptAssessment): string {
  switch (assessment.kind) {
    case "external":
      return `Receipted by ${RECEIPT_ISSUER_LABELS[assessment.issuer]}`;
    case "receipted":
      return "Receipted";
    case "skipped":
      return `Not receipted (${RECEIPT_SKIP_LABELS[assessment.reason]})`;
    case "eligible":
      return assessment.with80G
        ? "Ready to receipt"
        : "Ready to receipt (without the 80G line)";
    case "blocked":
      return `Not receipted (${assessment.blocks.map((block) => RECEIPT_BLOCK_LABELS[block]).join("; ")})`;
    default:
      return "";
  }
}

// ── Income table Receipt column ─────────────────────────────────────────────

/**
 * One compact value per gift for the Income table's Receipt column and
 * filter. `issued` shows the receipt number; `none` is a gift whose money
 * isn't (or is no longer) with the trust.
 */
export const receiptColumnValues = [
  "issued",
  "razorpay",
  "give_do",
  "ready",
  "needs_details",
  "not_needed",
  "none",
] as const;
export type ReceiptColumnValue = (typeof receiptColumnValues)[number];

export const RECEIPT_COLUMN_LABELS: Record<ReceiptColumnValue, string> = {
  give_do: `By ${RECEIPT_ISSUER_LABELS.give_do}`,
  issued: "Issued",
  needs_details: "Needs details",
  none: "—",
  not_needed: "Not needed",
  razorpay: `By ${RECEIPT_ISSUER_LABELS.razorpay}`,
  ready: "Ready to issue",
};

/** The Receipt filter's options; `none` gets words instead of a dash. */
export const RECEIPT_COLUMN_FILTER_LABELS: Record<ReceiptColumnValue, string> =
  {
    ...RECEIPT_COLUMN_LABELS,
    issued: "Receipt issued",
    none: "Not received (pending, refunded, reversed)",
  };

/**
 * The column value for an assessment. A live receipt always shows; money
 * that is pending, refunded or reversed shows a dash, even on a gateway.
 */
export function receiptColumnValue(
  assessment: ReceiptAssessment,
  status: string | null | undefined
): ReceiptColumnValue {
  if (assessment.kind === "receipted") {
    return "issued";
  }
  if (status === "pending" || status === "refunded" || status === "reversed") {
    return "none";
  }
  switch (assessment.kind) {
    case "external":
      return assessment.issuer;
    case "skipped":
      return assessment.reason === "in_kind" ||
        assessment.reason === "before_start"
        ? "not_needed"
        : "none";
    case "eligible":
      return "ready";
    case "blocked":
      return "needs_details";
    default:
      return "none";
  }
}

/**
 * The column value from the gift alone, or null when it turns on the
 * donor's private details (a direct gift that could be receipted), which
 * only the server reads.
 */
export function receiptColumnValueWithoutDonor(
  gift: ReceiptGiftFacts
): ReceiptColumnValue | null {
  const assessment = assessReceipt(gift, undefined);
  if (assessment.kind === "blocked" || assessment.kind === "eligible") {
    return null;
  }
  return receiptColumnValue(assessment, gift.status);
}

/** Most gifts one issue may cover. */
export const MAX_RECEIPTS_PER_ISSUE = 500;

// ── Void ────────────────────────────────────────────────────────────────────

export const VOID_REASON_MIN = 5;
export const VOID_REASON_MAX = 300;

/** Who may read receipts (the Receipts tab and the sheet's receipt line). */
export const RECEIPT_VIEW_PERMISSIONS = [
  "finance.view",
  "finance.manage",
  "donors.manage",
  "donors.receipt",
] as const;

/**
 * Receipts are read on the Income page, so a reader needs an income
 * permission as well; `donors.receipt` alone opens nothing.
 */
export function canReadReceipts(
  hasPermission: (permission: string) => boolean
): boolean {
  return (
    INCOME_PERMISSIONS.some(hasPermission) &&
    RECEIPT_VIEW_PERMISSIONS.some(hasPermission)
  );
}

/** The donor's ID as printed: the type's label and the number. */
export const RECEIPT_ID_TYPE_LABELS: Record<
  Exclude<PartyIdType, "none">,
  string
> = {
  driving_licence: "Driving licence",
  pan: "PAN",
  passport: "Passport",
  ration_card: "Ration card",
  tax_id_foreign: "Tax ID",
  voter_id: "Voter ID",
};
