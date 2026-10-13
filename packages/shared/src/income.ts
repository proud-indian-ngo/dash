/**
 * Client-safe rules for contributions and other income, shared by the Zero
 * mutators, the server functions and the forms so they never disagree.
 */
import type {
  ContributionChannel,
  ContributionReportingMode,
  ContributionSource,
  ContributionStatus,
  DonationType,
  OtherIncomeKind,
} from "./constants";
import { directoryRoleValues } from "./constants";

/**
 * Roles that may give a contribution: individual donors, CSR sponsors,
 * grantors, and intermediaries such as Goodera that pass CSR money on.
 */
export const CONTRIBUTOR_ROLES = directoryRoleValues;

/** Any of these opens the Income page; managing implies seeing. */
export const INCOME_PERMISSIONS = [
  "donors.view",
  "finance.view",
  "donors.manage",
  "finance.manage",
] as const;

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

/** The reporting mode a channel implies; the person recording it may change it. */
export function defaultReportingMode(
  channel: ContributionChannel
): ContributionReportingMode {
  if (channel === "cash") {
    return "cash";
  }
  if (channel === "in_kind") {
    return "in_kind";
  }
  return "electronic_or_account_payee";
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

export interface ContributionRuleInput {
  channel: ContributionChannel;
  donationType: DonationType;
  donationTypeDescription?: string | null;
  inKindDescription?: string | null;
  inKindValuationBasis?: string | null;
  orgAccountId?: string | null;
  reportingMode: ContributionReportingMode;
  reportingModeDescription?: string | null;
}

export interface RuleIssue {
  message: string;
  path: keyof ContributionRuleInput;
}

const blank = (value: string | null | undefined) => !value?.trim();

/**
 * Cross-field rules: "other" needs a description, in-kind needs what was
 * given and how it was valued and has no account, everything else needs the
 * account it was deposited into.
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
