/**
 * Client-safe rules for contributions and other income, shared by the Zero
 * mutators, the server functions and the forms so they never disagree.
 */
import type {
  ContributionChannel,
  ContributionReportingMode,
  ContributionSource,
  ContributionStatus,
  DeductionEligible,
  DonationType,
  OtherIncomeKind,
} from "./constants";
import { directoryRoleValues, GIVE_INDIA_PARTY_ID } from "./constants";
import {
  CHANNEL_REPORTING_MODES,
  reportingModeIssue,
} from "./contribution-channel";
import {
  donationTypeFundIssue,
  donationTypeProgrammeIssue,
} from "./contribution-programme";
import { sumPaise } from "./money";

/**
 * Roles that may give a contribution: individual donors, CSR sponsors,
 * grantors, and intermediaries such as Goodera that pass CSR money on.
 */
export const CONTRIBUTOR_ROLES = directoryRoleValues;

/** Roles that make a party a giver in its own right. */
export const GIVER_ROLES = ["donor", "sponsor", "grantor"] as const;

/**
 * Donation platforms recorded as the intermediary of the gifts they pass on.
 * Their intermediary role does not make them a giver; only a donor, sponsor
 * or grantor role does.
 */
export const PLATFORM_INTERMEDIARY_PARTY_IDS: readonly string[] = [
  GIVE_INDIA_PARTY_ID,
];

/** Whether a party with these active roles may be picked as the giver of a contribution. */
export function canGive(
  partyId: string,
  activeRoles: readonly string[]
): boolean {
  const roles = PLATFORM_INTERMEDIARY_PARTY_IDS.includes(partyId)
    ? GIVER_ROLES
    : CONTRIBUTOR_ROLES;
  return activeRoles.some((role) =>
    (roles as readonly string[]).includes(role)
  );
}

/** Any of these opens the Income page; managing implies seeing. */
export const INCOME_PERMISSIONS = [
  "donors.view",
  "finance.view",
  "donors.manage",
  "finance.manage",
] as const;

/** Upper bound on the Income page's local contribution dataset. */
export const INCOME_LIST_LIMIT = 5000;

export const CONTRIBUTION_CHANNEL_LABELS: Record<ContributionChannel, string> =
  {
    cash: "Cash",
    cheque: "Cheque",
    give_do: "give.do",
    in_kind: "In kind",
    neft: "NEFT/IMPS",
    razorpay: "Razorpay",
    upi: "UPI",
  };

export const REPORTING_MODE_LABELS: Record<ContributionReportingMode, string> =
  {
    cash: "Cash",
    electronic_or_account_payee: "Electronic or account-payee cheque",
    in_kind: "In kind",
    other: "Other",
  };

export const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  corpus: "Corpus",
  csr: "CSR",
  other: "Other",
  specific_grant: "Specific grant",
  voluntary: "Voluntary",
};

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  pending: "Pending",
  receipted: "Receipted",
  received: "Received",
  refunded: "Refunded",
  reversed: "Reversed",
};

/**
 * The statuses the Status column and filter show: the money's lifecycle
 * only. Receipting has its own column, so a stored `receipted` shows as
 * Received (the stored value and its edit lock are unchanged).
 */
export const contributionDisplayStatusValues = [
  "pending",
  "received",
  "refunded",
  "reversed",
] as const;
export type ContributionDisplayStatus =
  (typeof contributionDisplayStatusValues)[number];

/** A stored status as the Status column shows it; null reads as received. */
export function contributionDisplayStatus(
  status: string | null | undefined
): ContributionDisplayStatus {
  return (contributionDisplayStatusValues as readonly string[]).includes(
    status ?? ""
  )
    ? (status as ContributionDisplayStatus)
    : "received";
}

export const CONTRIBUTION_SOURCE_LABELS: Record<ContributionSource, string> = {
  import: "Imported",
  manual: "Manual",
};

export const OTHER_INCOME_KIND_LABELS: Record<OtherIncomeKind, string> = {
  asset_income: "Asset income",
  grant_return: "Grant return",
  interest: "Interest",
  misc: "Miscellaneous",
};

/** The reporting mode a channel implies; only a cheque may be reported otherwise. */
export function defaultReportingMode(
  channel: ContributionChannel
): ContributionReportingMode {
  return CHANNEL_REPORTING_MODES[channel][0] ?? "electronic_or_account_payee";
}

/** A contribution can be edited or deleted only before it is receipted or reversed. */
export const EDITABLE_CONTRIBUTION_STATUSES: readonly ContributionStatus[] = [
  "pending",
  "received",
];

export function isContributionEditable(status: string): boolean {
  return (EDITABLE_CONTRIBUTION_STATUSES as readonly string[]).includes(status);
}

/**
 * What a recorded refund fixes on a contribution: the facts the provider
 * reported (amount, giver, date, account, channel). Status follows the
 * refunds and the contribution can no longer be deleted; programme,
 * project, fund, notes and the other classification fields stay editable.
 */
export const REFUND_LOCKED_FIELDS = [
  "amountPaise",
  "partyId",
  "receivedOn",
  "orgAccountId",
  "channel",
] as const;
export type RefundLockedField = (typeof REFUND_LOCKED_FIELDS)[number];

/** The refund-locked fields an edit would change; empty when it may go ahead. */
export function refundLockedChanges(
  existing: Record<RefundLockedField, unknown>,
  next: Record<RefundLockedField, unknown>
): RefundLockedField[] {
  return REFUND_LOCKED_FIELDS.filter(
    (field) => (existing[field] ?? null) !== (next[field] ?? null)
  );
}

/**
 * Whether a contribution may be deleted: editable, no refund recorded
 * against it, and no receipt ever issued for it (voided ones included,
 * since receipt numbers are never reused).
 */
export function isContributionDeletable(
  status: string,
  refunds?: readonly unknown[] | null,
  receipts?: readonly unknown[] | null
): boolean {
  return (
    isContributionEditable(status) &&
    (refunds?.length ?? 0) === 0 &&
    (receipts?.length ?? 0) === 0
  );
}

/**
 * Statuses that count as money received. Pending money has not arrived yet,
 * and refunded or reversed money has gone back, so neither counts.
 */
export const CONTRIBUTION_RECEIVED_STATUSES: readonly ContributionStatus[] = [
  "received",
  "receipted",
];

export function countsAsReceived(status: string): boolean {
  return (CONTRIBUTION_RECEIVED_STATUSES as readonly string[]).includes(status);
}

/** A contribution with the refunds recorded against it (none, when not loaded). */
export interface NetReceivedInput {
  amountPaise: number;
  refunds?: readonly { amountPaise: number }[] | null;
  status: string | null;
}

/** Total refunded against a contribution, in paise. */
export function refundedPaise(refunds: NetReceivedInput["refunds"]): number {
  return sumPaise((refunds ?? []).map((refund) => refund.amountPaise));
}

/**
 * Money a contribution still brings in: its amount less its refunds when its
 * status counts as received, otherwise nothing. A full refund already moves
 * the status to `refunded`; this takes off partial refunds and never goes
 * below zero (a refund after receipt leaves the status alone). Used by the
 * Income stats, the donor sheet's Giving section and the server query alike.
 */
export function netReceivedPaise(contribution: NetReceivedInput): number {
  if (!countsAsReceived(contribution.status ?? "received")) {
    return 0;
  }
  return Math.max(
    0,
    contribution.amountPaise - refundedPaise(contribution.refunds)
  );
}

/**
 * How a contribution's refunds show next to its status: whether it reads
 * "Partly refunded" instead of its stored status (some, not all, has gone
 * back and the status is not `refunded`), and how much was refunded, for a
 * tooltip or a detail row. Null when nothing was refunded. Derived, never
 * stored; a receipted contribution its refunds cover keeps its status (shown as Received).
 */
export function refundSummary(
  contribution: NetReceivedInput
): { partly: boolean; refundedPaise: number } | null {
  const refunded = refundedPaise(contribution.refunds);
  if (refunded <= 0) {
    return null;
  }
  return {
    partly:
      contribution.status !== "refunded" && refunded < contribution.amountPaise,
    refundedPaise: refunded,
  };
}

const RAZORPAY_PAYMENT_ID = /^pay_[A-Za-z0-9]{1,40}$/;

/**
 * The Razorpay dashboard page of a contribution imported from Razorpay, or
 * null. Such a contribution's reference is its payment ID, so nothing
 * private is needed. The dashboard opens in whichever mode (live or test)
 * the person has selected there; Razorpay enforces its own login.
 */
export function razorpayPaymentUrl(contribution: {
  channel: string;
  reference?: string | null;
  source?: string | null;
}): string | null {
  const reference = contribution.reference ?? "";
  return contribution.channel === "razorpay" &&
    contribution.source === "import" &&
    RAZORPAY_PAYMENT_ID.test(reference)
    ? `https://dashboard.razorpay.com/app/payments/${reference}`
    : null;
}

export interface ContributionRuleInput {
  channel: ContributionChannel;
  /** The gift's tax certificate choice; "no" (Exclude) needs a reason. */
  deductionEligible?: DeductionEligible | null;
  donationType: DonationType;
  donationTypeDescription?: string | null;
  eligibilityReason?: string | null;
  /** Checked against the donation type (`donationTypeFundIssue`); left out, not checked. */
  fundId?: string | null;
  inKindDescription?: string | null;
  inKindValuationBasis?: string | null;
  orgAccountId?: string | null;
  /** With the project, checked against the donation type (`donationTypeProgrammeIssue`). */
  programmeId?: string | null;
  projectId?: string | null;
  reportingMode: ContributionReportingMode;
  reportingModeDescription?: string | null;
}

export interface RuleIssue {
  message: string;
  path: keyof ContributionRuleInput;
}

const blank = (value: string | null | undefined) => !value?.trim();

/**
 * Cross-field rules: "other" needs a description, the channel limits the
 * reporting mode (`CHANNEL_REPORTING_MODES`), in-kind needs what was given
 * and how it was valued and has no account, everything else needs the
 * account it was deposited into, the donation type decides whether a
 * programme is needed, allowed or ruled out (`donationTypeProgrammeIssue`),
 * the corpus type and the Corpus Fund go together (`donationTypeFundIssue`),
 * and excluding a gift from the donations return needs a reason. Which account fits the channel needs the accounts,
 * so `channelAccountIssue` checks that separately.
 */
export function contributionRuleIssues(v: ContributionRuleInput): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (v.reportingMode === "other" && blank(v.reportingModeDescription)) {
    issues.push({
      message: "Describe the reporting mode",
      path: "reportingModeDescription",
    });
  }
  if (v.donationType === "other" && blank(v.donationTypeDescription)) {
    issues.push({
      message: "Describe the donation type",
      path: "donationTypeDescription",
    });
  }
  // The channel decides the mode, so the donations return can never report
  // a gift under a mode its channel rules out.
  const modeIssue = reportingModeIssue(v.channel, v.reportingMode);
  if (modeIssue) {
    issues.push({ message: modeIssue, path: "reportingMode" });
  }
  const programmeIssue = donationTypeProgrammeIssue(v);
  if (programmeIssue) {
    issues.push({ message: programmeIssue, path: "programmeId" });
  }
  const fundIssue = donationTypeFundIssue(v);
  if (fundIssue) {
    issues.push({ message: fundIssue, path: "fundId" });
  }
  if (v.deductionEligible === "no" && blank(v.eligibilityReason)) {
    issues.push({
      message: "Say why this gift is left out of the donations return",
      path: "eligibilityReason",
    });
  }
  if (v.channel === "in_kind") {
    if (blank(v.inKindDescription)) {
      issues.push({
        message: "Describe what was given",
        path: "inKindDescription",
      });
    }
    if (blank(v.inKindValuationBasis)) {
      issues.push({
        message: "Say how the value was worked out",
        path: "inKindValuationBasis",
      });
    }
    if (v.orgAccountId) {
      issues.push({
        message: "In-kind gifts are not deposited into an account",
        path: "orgAccountId",
      });
    }
  } else if (!v.orgAccountId) {
    issues.push({
      message: "Pick the account it was deposited into",
      path: "orgAccountId",
    });
  }
  return issues;
}

// ── Financial year ──────────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

/** Today's calendar date in India (yyyy-MM-dd), where the trust keeps its books. */
export function todayInKolkata(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: IST,
    year: "numeric",
  }).format(now);
}

export interface FinancialYearRange {
  /** Last day, inclusive (yyyy-MM-dd). */
  endsOn: string;
  /** For example "2026-27". */
  label: string;
  /** First day (yyyy-MM-dd). */
  startsOn: string;
}

/** The April-to-March year containing a calendar date (yyyy-MM-dd). */
export function financialYearOf(isoDate: string): FinancialYearRange {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  if (!(Number.isInteger(year) && month >= 1 && month <= 12)) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  const start = month >= 4 ? year : year - 1;
  return {
    endsOn: `${start + 1}-03-31`,
    label: `${start}-${String(start + 1).slice(2)}`,
    startsOn: `${start}-04-01`,
  };
}

/** The financial year that is running now in India. */
export function currentFinancialYear(
  now: Date = new Date()
): FinancialYearRange {
  return financialYearOf(todayInKolkata(now));
}

/** Zero carries Postgres `date` columns as the epoch of UTC midnight. */
export function epochDayToIso(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

/** Whether a Zero `date` epoch falls inside a financial year. */
export function isInFinancialYear(
  epoch: number,
  range: FinancialYearRange
): boolean {
  const day = epochDayToIso(epoch);
  return day >= range.startsOn && day <= range.endsOn;
}
