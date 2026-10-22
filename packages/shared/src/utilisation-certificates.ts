import {
  type BoardMember,
  nextDay,
  TRUSTEE_OFFICE_LABELS,
  type TrusteeOffice,
} from "./governance";
import type { GrantUtilisation } from "./grants";
import { formatPaise, sumPaise } from "./money";

/**
 * Utilisation certificates (finance-grants.md): a grant's utilisation for a
 * period, GFR 12-A style, frozen when finance prepares it and signed with
 * DSC by the Head of the Organisation and then the Chief Finance Officer,
 * then countersigned by a CA when the grant's agreement asks for one. Pure:
 * the figures come from `grantUtilisation`, never derived again here.
 */

export const utilisationCertificateStatusValues = [
  "awaiting_head",
  "awaiting_finance",
  "awaiting_ca",
  "final",
  "cancelled",
  "discarded",
] as const;
export type UtilisationCertificateStatus =
  (typeof utilisationCertificateStatusValues)[number];

/**
 * A certificate in these holds its range: linked money and event spend on
 * or before its end can't move under it.
 */
export const LIVE_CERTIFICATE_STATUSES = [
  "awaiting_head",
  "awaiting_finance",
  "awaiting_ca",
  "final",
] as const satisfies readonly UtilisationCertificateStatus[];

export function isLiveCertificate(status: string): boolean {
  return (LIVE_CERTIFICATE_STATUSES as readonly string[]).includes(status);
}

/** `UC/2026-27/001`: one gap-free series per financial year of preparing. */
export function certificateNumber(fiscalYear: string, sequence: number) {
  return `UC/${fiscalYear}/${String(sequence).padStart(3, "0")}`;
}

export const UDIN_PATTERN = /^[0-9]{8}[A-Z0-9]{10}$/;
export const CERTIFICATE_PLACE_MAX = 80;
export const CANCEL_REASON_MAX = 500;

// ── Signatories ─────────────────────────────────────────────────────────────

export type SignatoryRole = "head" | "finance";

/** GFR 12-A's two signatures, in the order they sign. */
export const SIGNATORY_ROLE_LABELS: Record<SignatoryRole, string> = {
  finance: "Chief Finance Officer",
  head: "Head of the Organisation",
};

export interface CertificateSignatory {
  name: string;
  office: TrusteeOffice;
  trusteeId: string;
}

/**
 * Who signs for the trust on a day: the Managing Trustee as Head of the
 * Organisation, then as Chief Finance Officer the Treasurer, or while no
 * other trustee holds that office the Joint Managing Trustee. Two different
 * trustees, or the reason there aren't.
 */
export function certificateSignatories(
  board: readonly BoardMember[]
):
  | { finance: CertificateSignatory; head: CertificateSignatory }
  | { problem: string } {
  // An office has one holder; a register that shows two on the day is
  // refused rather than guessed at.
  const holders = (office: TrusteeOffice) =>
    board.filter((m) => m.offices.includes(office));
  const twice = (
    ["managing_trustee", "treasurer", "joint_managing_trustee"] as const
  ).find((office) => holders(office).length > 1);
  if (twice) {
    return {
      problem: `The register shows more than one ${TRUSTEE_OFFICE_LABELS[twice]} today. Correct it before preparing a certificate.`,
    };
  }
  const holder = (office: TrusteeOffice, except?: string) => {
    const member = holders(office).find((m) => m.trustee.id !== except);
    return member
      ? { name: member.trustee.legalName, office, trusteeId: member.trustee.id }
      : null;
  };
  const head = holder("managing_trustee");
  if (!head) {
    return {
      problem:
        "No Managing Trustee is in office to sign as Head of the Organisation.",
    };
  }
  const finance =
    holder("treasurer", head.trusteeId) ??
    holder("joint_managing_trustee", head.trusteeId);
  if (!finance) {
    return {
      problem:
        "No Treasurer or Joint Managing Trustee other than the Managing Trustee is in office to sign as Chief Finance Officer.",
    };
  }
  return { finance, head };
}

export function signatoryTitle(
  role: SignatoryRole,
  signatory: CertificateSignatory
): string {
  return `${SIGNATORY_ROLE_LABELS[role]} (${TRUSTEE_OFFICE_LABELS[signatory.office]})`;
}

// ── Figures ─────────────────────────────────────────────────────────────────

export interface CertificateMoneyLine {
  contributionId: string;
  /** yyyy-MM-dd. */
  on: string;
  paise: number;
  reference: string | null;
}

export interface CertificateHeadLine {
  accountHeadId: string;
  /** Null: the head has no budget on the grant. */
  budgetPaise: number | null;
  name: string;
  /** Spent within the period. */
  periodPaise: number;
  /** Spent from the grant's start to the period's end. */
  toDatePaise: number;
}

/** What a certificate prints, GFR 12-A's balance chain. */
export interface CertificateFigures {
  /** Received less refunded less spent before the period, and earlier interest. */
  broughtForwardPaise: number;
  closingPaise: number;
  heads: CertificateHeadLine[];
  /** Interest earned in the period, as finance entered it. */
  interestPaise: number;
  /** Interest entered on earlier certificates of the grant ending before the period. */
  interestBroughtForwardPaise: number;
  received: CertificateMoneyLine[];
  receivedPaise: number;
  refunds: CertificateMoneyLine[];
  refundedPaise: number;
  spentPaise: number;
  totalAvailablePaise: number;
}

/**
 * The certificate's figures from `grantUtilisation` for its period, plus
 * the interest finance entered. Interest isn't separated in the books, so
 * it enters the chain only here: interest entered on earlier certificates
 * of the grant is brought forward with the unspent balance.
 */
export function certificateFigures(input: {
  headNames: ReadonlyMap<string, string>;
  interestBroughtForwardPaise: number;
  interestPaise: number;
  utilisation: GrantUtilisation;
}): CertificateFigures {
  const { utilisation: u } = input;
  const broughtForwardPaise =
    u.broughtForwardPaise + input.interestBroughtForwardPaise;
  const totalAvailablePaise =
    broughtForwardPaise +
    input.interestPaise +
    u.receivedPaise -
    u.refundedPaise;
  return {
    broughtForwardPaise,
    closingPaise: totalAvailablePaise - u.spentPaise,
    heads: u.heads.map((h) => ({
      accountHeadId: h.accountHeadId,
      budgetPaise: h.budgetPaise,
      name: input.headNames.get(h.accountHeadId) ?? "Account head",
      periodPaise: h.periodPaise,
      toDatePaise: h.toDatePaise,
    })),
    interestBroughtForwardPaise: input.interestBroughtForwardPaise,
    interestPaise: input.interestPaise,
    received: u.received.map((r) => ({
      contributionId: r.contributionId,
      on: r.receivedOn,
      paise: r.paise,
      reference: r.reference,
    })),
    receivedPaise: u.receivedPaise,
    refunds: u.refunds.map((r) => ({
      contributionId: r.contributionId,
      on: r.refundedOn,
      paise: r.paise,
      reference: r.reference,
    })),
    refundedPaise: u.refundedPaise,
    spentPaise: u.spentPaise,
    totalAvailablePaise,
  };
}

/** Interest on the grant's live certificates that end before `from`. */
export function interestBroughtForward(
  certificates: readonly {
    interestPaise: number;
    status: string;
    toOn: string;
  }[],
  from: string
): number {
  return sumPaise(
    certificates
      .filter((c) => isLiveCertificate(c.status) && c.toOn < from)
      .map((c) => c.interestPaise)
  );
}

/** Spent to date as a share of the head's budget, to one decimal; null without a budget. */
export function percentOfBudget(head: CertificateHeadLine): number | null {
  if (head.budgetPaise === null || head.budgetPaise === 0) {
    return null;
  }
  return Math.round((head.toDatePaise * 1000) / head.budgetPaise) / 10;
}

/** "4 Aug 2026", as the app shows dates. */
const dayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const formatDay = (iso: string) =>
  dayFormat.format(new Date(`${iso}T00:00:00Z`));

/** The drift badge: "since signing" once anyone signed, else "since prepared". */
export function driftLabel(signed: boolean): string {
  return signed
    ? "Figures changed since signing"
    : "Figures changed since prepared";
}

/** Why a drifted certificate can't be signed, in the badge's words. */
export function driftRefusal(signed: boolean): string {
  return `${driftLabel(signed)}, so it can't be signed. Finance should discard or cancel it and prepare it again.`;
}

/**
 * A CSR grant's certificate prints the trust's CSR-1 registration, so it
 * can't be prepared without one; a specific grant's can.
 */
export function csr1Problem(
  donationType: string,
  trust: { csr1: string | null } | null
): string | null {
  return donationType === "csr" && trust && !trust.csr1
    ? "A CSR grant's certificate prints the trust's CSR-1 registration number. Add it under Governance → Registrations first."
    : null;
}

/**
 * What changed between a certificate's frozen figures and the same period
 * computed now, in words; empty when nothing did.
 */
export function certificateDrift(
  was: CertificateFigures,
  now: CertificateFigures
): string[] {
  const changes: string[] = [];
  const amount = (label: string, before: number, after: number) => {
    if (before !== after) {
      changes.push(
        `${label}: ${formatPaise(before)} then, ${formatPaise(after)} now`
      );
    }
  };
  amount(
    "Unspent brought forward",
    was.broughtForwardPaise,
    now.broughtForwardPaise
  );
  const lines = (
    label: string,
    before: readonly CertificateMoneyLine[],
    after: readonly CertificateMoneyLine[]
  ) => {
    const key = (l: CertificateMoneyLine) =>
      `${l.contributionId}\u0000${l.on}\u0000${l.paise}`;
    const afterKeys = new Set(after.map(key));
    const beforeKeys = new Set(before.map(key));
    for (const l of before.filter((b) => !afterKeys.has(key(b)))) {
      changes.push(
        `${label} of ${formatPaise(l.paise)} on ${formatDay(l.on)} (${l.reference ?? "no reference"}) no longer counts`
      );
    }
    for (const l of after.filter((a) => !beforeKeys.has(key(a)))) {
      changes.push(
        `${label} of ${formatPaise(l.paise)} on ${formatDay(l.on)} (${l.reference ?? "no reference"}) now counts`
      );
    }
  };
  lines("Receipt", was.received, now.received);
  lines("Refund", was.refunds, now.refunds);
  const heads = new Map(now.heads.map((h) => [h.accountHeadId, h]));
  for (const head of was.heads) {
    amount(
      `Spent on ${head.name}`,
      head.periodPaise,
      heads.get(head.accountHeadId)?.periodPaise ?? 0
    );
    heads.delete(head.accountHeadId);
  }
  for (const head of heads.values()) {
    amount(`Spent on ${head.name}`, 0, head.periodPaise);
  }
  amount("Closing unspent", was.closingPaise, now.closingPaise);
  return changes;
}

// ── Snapshot ────────────────────────────────────────────────────────────────

/** Everything the PDF prints, frozen when the certificate is prepared. */
export interface UtilisationCertificateSnapshot {
  caRequired: boolean;
  figures: CertificateFigures;
  grant: {
    agreementOn: string | null;
    agreementReference: string | null;
    grantor: string;
    programme: string;
    project: string;
    sanctionedPaise: number;
    scheduleViiItem: string | null;
    title: string;
  };
  number: string;
  period: { from: string; to: string };
  place: string;
  /** yyyy-MM-dd, India. */
  preparedOn: string;
  signatories: { finance: CertificateSignatory; head: CertificateSignatory };
  trust: {
    address: string;
    csr1: string | null;
    name: string;
    pan: string;
    registration12ab: string | null;
    registration80g: string | null;
  };
  version: 1;
}

// ── Ranges held by certificates ─────────────────────────────────────────────

export interface CertificateRange {
  grantId: string;
  number: string;
  status: string;
  /** yyyy-MM-dd: the period's last day. */
  toOn: string;
}

/**
 * The live certificate of the grant whose figures a change dated `on`
 * would alter: one ending on or after it (its own period, or the balance
 * it brings forward). Null when none.
 */
export function certificateHolding<T extends CertificateRange>(
  certificates: readonly T[],
  grantId: string,
  on: string
): T | null {
  return (
    certificates.find(
      (c) =>
        c.grantId === grantId && isLiveCertificate(c.status) && on <= c.toOn
    ) ?? null
  );
}

export function certificateLockMessage(
  certificate: Pick<CertificateRange, "number" | "status">,
  change: string
): string {
  const how =
    certificate.status === "awaiting_head"
      ? "Discard it first"
      : "Cancel it first";
  return `Utilisation certificate ${certificate.number} covers this, so ${change} would change its figures. ${how}, then prepare a new one.`;
}

// ── Period and progress ─────────────────────────────────────────────────────

/**
 * The period a new certificate starts with: from the day after the last
 * live certificate's end (live ones never overlap), or the grant's start,
 * to today or the grant's end, whichever comes first.
 */
export function defaultCertificatePeriod(
  grant: { endsOn: string; startsOn: string },
  certificates: readonly { status: string; toOn: string }[],
  today: string
): { from: string; to: string } {
  const lastLive = certificates
    .filter((c) => isLiveCertificate(c.status))
    .map((c) => c.toOn)
    .sort()
    .at(-1);
  const to = today < grant.endsOn ? today : grant.endsOn;
  const from = lastLive ? nextDay(lastLive) : grant.startsOn;
  return { from: from > to ? to : from, to };
}

export type CertificateStepState = "done" | "current" | "upcoming" | "stopped";

/** Prepare, the two signatures, the CA (when the agreement asks) and final. */
export function certificateSteps(certificate: {
  caRequired: boolean;
  status: string;
}): { key: string; label: string; state: CertificateStepState }[] {
  const order = [
    "prepared",
    "awaiting_head",
    "awaiting_finance",
    ...(certificate.caRequired ? ["awaiting_ca"] : []),
    "final",
  ];
  const labels: Record<string, string> = {
    awaiting_ca: "CA certificate",
    awaiting_finance: SIGNATORY_ROLE_LABELS.finance,
    awaiting_head: SIGNATORY_ROLE_LABELS.head,
    final: "Final",
    prepared: "Prepared",
  };
  const stopped =
    certificate.status === "cancelled" || certificate.status === "discarded";
  const at = stopped ? -1 : order.indexOf(certificate.status);
  return order.map((key, index) => {
    let state: CertificateStepState = "upcoming";
    if (stopped) {
      state = index === 0 ? "done" : "stopped";
    } else if (index < at || (key === "final" && at === index)) {
      state = "done";
    } else if (index === at) {
      state = "current";
    }
    return { key, label: labels[key] ?? key, state };
  });
}

/** The status a list shows: whose turn it is, or how it ended. */
export function certificateStatusLabel(
  status: string,
  signatories: UtilisationCertificateSnapshot["signatories"]
): string {
  switch (status) {
    case "awaiting_head":
      return `Waiting for ${signatories.head.name}`;
    case "awaiting_finance":
      return `Waiting for ${signatories.finance.name}`;
    case "awaiting_ca":
      return "Waiting for CA";
    case "final":
      return "Final";
    case "cancelled":
      return "Cancelled";
    default:
      return "Discarded";
  }
}

/** Whose signature the certificate waits for, or null. */
export function signerDue(status: string): SignatoryRole | null {
  if (status === "awaiting_head") {
    return "head";
  }
  return status === "awaiting_finance" ? "finance" : null;
}
