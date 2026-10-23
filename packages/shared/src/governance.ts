/**
 * Governance: the trustee register and the deed's rules. Pure functions over
 * plain rows so the register page, the server and the reminder job agree.
 *
 * Dates are calendar dates in India as `yyyy-MM-dd` strings, which compare
 * correctly as strings. A term's `endsOn` is the last day of a fixed term
 * (inclusive; null for life). `endedOn`, on terms and offices, is the day
 * the trustee stopped holding it: they are not in office from that day.
 */

// ── Values ──────────────────────────────────────────────────────────────────

export const trusteeOfficeValues = [
  "managing_trustee",
  "joint_managing_trustee",
  "president",
  "vice_president",
  "secretary",
  "treasurer",
] as const;
export type TrusteeOffice = (typeof trusteeOfficeValues)[number];

export const TRUSTEE_OFFICE_LABELS: Record<TrusteeOffice, string> = {
  joint_managing_trustee: "Joint Managing Trustee",
  managing_trustee: "Managing Trustee",
  president: "President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  vice_president: "Vice President",
};

export const trusteeTermBasisValues = [
  "deed_original",
  "co_option_4_5",
  "appointment_7_9",
  "reappointment",
] as const;
export type TrusteeTermBasis = (typeof trusteeTermBasisValues)[number];

export const TRUSTEE_TERM_BASIS_LABELS: Record<TrusteeTermBasis, string> = {
  appointment_7_9: "Appointed at a meeting (clause 7.9)",
  co_option_4_5: "Co-opted (clause 4.5)",
  deed_original: "Named in the deed",
  reappointment: "Reappointed",
};

export const trusteeCessationBasisValues = [
  "resignation",
  "term_end",
  "absence_4_23",
  "death",
  "removal_7_12",
] as const;
export type TrusteeCessationBasis =
  (typeof trusteeCessationBasisValues)[number];

export const TRUSTEE_CESSATION_BASIS_LABELS: Record<
  TrusteeCessationBasis,
  string
> = {
  absence_4_23: "Ceased for absence (clause 4.23)",
  death: "Died",
  removal_7_12: "Removed (clause 7.12)",
  resignation: "Resigned (clause 4.13)",
  term_end: "Term ended",
};

export const governanceDocumentKindValues = [
  "trust_deed",
  "deed_amendment",
  "registration_certificate",
  "resolution",
  "minutes",
  "resignation",
  "acceptance",
  "policy",
  "declaration",
  "utilisation_certificate",
  "evidence",
  "other",
] as const;
export type GovernanceDocumentKind =
  (typeof governanceDocumentKindValues)[number];

export const GOVERNANCE_DOCUMENT_KIND_LABELS: Record<
  GovernanceDocumentKind,
  string
> = {
  acceptance: "Acceptance of trusteeship",
  declaration: "Declaration of interests",
  deed_amendment: "Deed of amendment",
  evidence: "Evidence",
  minutes: "Minutes",
  other: "Other",
  policy: "Policy",
  registration_certificate: "Registration certificate",
  resignation: "Resignation",
  resolution: "Resolution",
  trust_deed: "Trust deed",
  utilisation_certificate: "Utilisation certificate",
};

/** How a vault document arrived: a plain PDF, a digitally signed PDF, an email, or a scan of paper. */
export const governanceDocumentFormatValues = [
  "pdf",
  "signed_pdf",
  "eml",
  "scan",
] as const;
export type GovernanceDocumentFormat =
  (typeof governanceDocumentFormatValues)[number];

export const GOVERNANCE_DOCUMENT_FORMAT_LABELS: Record<
  GovernanceDocumentFormat,
  string
> = {
  eml: "Email (.eml)",
  pdf: "PDF",
  scan: "Scan of paper",
  signed_pdf: "Digitally signed PDF",
};

export const quorumKindValues = ["fixed", "fraction"] as const;
export type QuorumKind = (typeof quorumKindValues)[number];

export const castingVoteRuleValues = ["chair", "co_founders", "none"] as const;
export type CastingVoteRule = (typeof castingVoteRuleValues)[number];

export const resolutionThresholdValues = [
  "majority_in_office",
  "two_thirds_in_office",
  "unanimous_others",
] as const;
export type ResolutionThreshold = (typeof resolutionThresholdValues)[number];

export const RESOLUTION_THRESHOLD_LABELS: Record<ResolutionThreshold, string> =
  {
    majority_in_office: "Majority of trustees in office",
    two_thirds_in_office: "Two-thirds of trustees in office",
    unanimous_others: "All other trustees",
  };

export const GOVERNANCE_PERMISSIONS = {
  kycView: "governance.kyc.view",
  manage: "governance.manage",
  view: "governance.view",
} as const;

/** Who may open the register, the vault and the deed pages. */
export const GOVERNANCE_PAGE_PERMISSIONS = [
  "governance.view",
  "governance.manage",
] as const;

/** Registrations are on filings too, so finance may open that page as well. */
export const REGISTRATIONS_PAGE_PERMISSIONS = [
  ...GOVERNANCE_PAGE_PERMISSIONS,
  "finance.view",
  "finance.manage",
] as const;

/** Days before a term's last day when its reminder goes out. */
export const TERM_REMINDER_DAYS = [90, 30, 7] as const;

/** The largest upload the vault accepts: deeds and scans run to a few MB. */
export const GOVERNANCE_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export const GOVERNANCE_DOCUMENT_CONTENT_TYPES = {
  eml: ["message/rfc822", "application/octet-stream"],
  pdf: ["application/pdf"],
  scan: ["application/pdf", "image/jpeg", "image/png"],
  signed_pdf: ["application/pdf"],
} as const satisfies Record<GovernanceDocumentFormat, readonly string[]>;

// ── Deed versions ───────────────────────────────────────────────────────────

export interface DeedRules {
  amendmentThreshold: ResolutionThreshold;
  castingVote: CastingVoteRule;
  /** Offices that may issue a circular, in fallback order. */
  circularIssuers: TrusteeOffice[];
  coOptionMaxYears: number;
  electronicCirculation: boolean;
  maxTrustees: number;
  minTrustees: number;
  noticeDays: number;
  /** Never fewer than this many, whatever the fraction gives. */
  quorumFloor: number;
  quorumKind: QuorumKind;
  /** An office whose holder must be present for a quorum, if any. */
  quorumRequiredOffice: TrusteeOffice | null;
  /** A head count for `fixed`; a percentage of trustees in office for `fraction`. */
  quorumValue: number;
  videoCountsPresent: boolean;
}

/** Fixed ID of deed version 1, ensured on every server start. */
export const DEED_VERSION_1_ID = "01930000-0000-7000-8000-00000000d001";

/** The rules of the deed as registered (Doc. No. 864, Book IV, 2018-19). */
export const DEED_VERSION_1 = {
  effectiveFrom: "2019-03-16",
  id: DEED_VERSION_1_ID,
  number: 1,
  rules: {
    amendmentThreshold: "two_thirds_in_office",
    // Clause 4.7 gives it to the Co-Founders, 4.17 to the Chairman; the
    // design resolves the conflict in favour of the chair.
    castingVote: "chair",
    circularIssuers: ["managing_trustee"],
    coOptionMaxYears: 3,
    electronicCirculation: false,
    maxTrustees: 9,
    minTrustees: 2,
    noticeDays: 7,
    quorumFloor: 5,
    quorumKind: "fixed",
    quorumRequiredOffice: "managing_trustee",
    quorumValue: 5,
    videoCountsPresent: false,
  } satisfies DeedRules,
  title: "Trust deed, Doc. No. 864, Book IV, 2018-19",
} as const;

export interface DeedVersionRow {
  effectiveFrom: string;
  id: string;
  number: number;
}

/** The deed version in force on a date: the latest that took effect on or before it. */
export function deedVersionOn<T extends DeedVersionRow>(
  versions: readonly T[],
  on: string
): T | null {
  let found: T | null = null;
  for (const version of versions) {
    if (
      version.effectiveFrom <= on &&
      (found === null || version.number > found.number)
    ) {
      found = version;
    }
  }
  return found;
}

/** How many trustees must be present for a meeting to be quorate under these rules. */
export function quorumFor(rules: DeedRules, trusteesInOffice: number): number {
  if (rules.quorumKind === "fixed") {
    return Math.max(rules.quorumValue, rules.quorumFloor);
  }
  const share = Math.ceil((trusteesInOffice * rules.quorumValue) / 100);
  return Math.max(share, rules.quorumFloor);
}

// ── The register ────────────────────────────────────────────────────────────

export interface TermRow {
  endedOn: string | null;
  endEvidenceDocumentId: string | null;
  endsOn: string | null;
  id: string;
  startEvidenceDocumentId: string | null;
  startsOn: string;
  basis: TrusteeTermBasis;
  trusteeId: string;
}

export interface OfficeRow {
  endedOn: string | null;
  endEvidenceDocumentId: string | null;
  id: string;
  office: TrusteeOffice;
  startEvidenceDocumentId: string | null;
  startsOn: string;
  trusteeId: string;
}

export interface TrusteeRow {
  id: string;
  isCoFounder: boolean;
  legalName: string;
}

/** The day after a date. */
export function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** A date plus a number of days (negative to go back). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from one date to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** The last day a term or office is held, or null while it runs without end. */
export function lastDayOf(period: {
  endedOn: string | null;
  endsOn?: string | null;
}): string | null {
  const ended = period.endedOn ? addDays(period.endedOn, -1) : null;
  const ends = period.endsOn ?? null;
  if (ended && ends) {
    return ended < ends ? ended : ends;
  }
  return ended ?? ends;
}

/** Whether a term or office is held on a date. */
export function isHeldOn(
  period: { endedOn: string | null; endsOn?: string | null; startsOn: string },
  on: string
): boolean {
  if (period.startsOn > on) {
    return false;
  }
  const last = lastDayOf(period);
  return last === null || on <= last;
}

/** Whether two periods share at least one day. */
function overlaps(
  a: { endedOn: string | null; endsOn?: string | null; startsOn: string },
  b: { endedOn: string | null; endsOn?: string | null; startsOn: string }
): boolean {
  const aLast = lastDayOf(a);
  const bLast = lastDayOf(b);
  return (
    (aLast === null || b.startsOn <= aLast) &&
    (bLast === null || a.startsOn <= bLast)
  );
}

/** Whether the second period lies wholly inside the first. */
function within(
  outer: { endedOn: string | null; endsOn?: string | null; startsOn: string },
  inner: { endedOn: string | null; endsOn?: string | null; startsOn: string }
): boolean {
  if (inner.startsOn < outer.startsOn) {
    return false;
  }
  const outerLast = lastDayOf(outer);
  if (outerLast === null) {
    return true;
  }
  const innerLast = lastDayOf(inner);
  return innerLast !== null && innerLast <= outerLast;
}

export interface BoardMember<T extends TrusteeRow = TrusteeRow> {
  offices: TrusteeOffice[];
  term: TermRow;
  trustee: T;
}

/** Who was a trustee on a date, with the offices each held that day, in name order. */
export function boardOn<T extends TrusteeRow>(
  input: {
    offices: readonly OfficeRow[];
    terms: readonly TermRow[];
    trustees: readonly T[];
  },
  on: string
): BoardMember<T>[] {
  const byId = new Map(input.trustees.map((t) => [t.id, t]));
  const effective = effectiveOffices(input);
  const members: BoardMember<T>[] = [];
  const seen = new Set<string>();
  for (const term of input.terms) {
    const trustee = byId.get(term.trusteeId);
    if (!(trustee && isHeldOn(term, on)) || seen.has(trustee.id)) {
      continue;
    }
    seen.add(trustee.id);
    const offices = effective
      .filter((o) => o.trusteeId === trustee.id && isHeldOn(o, on))
      .map((o) => o.office)
      .sort(
        (a, b) =>
          trusteeOfficeValues.indexOf(a) - trusteeOfficeValues.indexOf(b)
      );
    members.push({ offices, term, trustee });
  }
  // By id among equal names, so the order never depends on the rows'.
  return members.sort(
    (a, b) =>
      a.trustee.legalName.localeCompare(b.trustee.legalName) ||
      a.trustee.id.localeCompare(b.trustee.id)
  );
}

/**
 * Offices as actually held. An office with no end of its own ends with the
 * term it started in: a trustee who resigns stops holding every office that
 * day, whether or not the office was closed separately.
 */
export function effectiveOffices(input: {
  offices: readonly OfficeRow[];
  terms: readonly TermRow[];
}): OfficeRow[] {
  return input.offices.map((o) => {
    if (o.endedOn) {
      return o;
    }
    const term = input.terms.find(
      (t) => t.trusteeId === o.trusteeId && isHeldOn(t, o.startsOn)
    );
    const last = term ? lastDayOf(term) : null;
    return last ? { ...o, endedOn: nextDay(last) } : o;
  });
}

/** The holder of an office on a date, if any. */
export function officeHolderOn(
  input: { offices: readonly OfficeRow[]; terms: readonly TermRow[] },
  office: TrusteeOffice,
  on: string
): OfficeRow | null {
  return (
    effectiveOffices(input).find(
      (o) => o.office === office && isHeldOn(o, on)
    ) ?? null
  );
}

// ── Warnings ────────────────────────────────────────────────────────────────

export type RegisterWarningCode =
  | "below_minimum"
  | "above_maximum"
  | "no_managing_trustee"
  | "meeting_quorum_unreachable"
  | "no_casting_vote"
  | "office_overlap"
  | "office_outside_term"
  | "term_overlap"
  | "co_option_too_long"
  | "term_ending_soon"
  | "term_end_below_minimum"
  | "unevidenced";

export type RegisterWarningSeverity = "error" | "warning" | "info";

export interface RegisterWarning {
  code: RegisterWarningCode;
  message: string;
  /** Term or office row IDs the warning is about. */
  rowIds: string[];
  severity: RegisterWarningSeverity;
  trusteeId: string | null;
}

export interface RegisterInput<T extends TrusteeRow = TrusteeRow> {
  offices: readonly OfficeRow[];
  rules: DeedRules;
  terms: readonly TermRow[];
  trustees: readonly T[];
}

function nameOf(trustees: readonly TrusteeRow[], id: string): string {
  return trustees.find((t) => t.id === id)?.legalName ?? "A trustee";
}

function pluralTrustees(count: number): string {
  return count === 1 ? "1 trustee" : `${count} trustees`;
}

/** Whole years between two dates, as a fraction, for the co-option limit. */
function termYears(startsOn: string, lastDay: string): number {
  return (daysBetween(startsOn, lastDay) + 1) / 365.25;
}

/** Board-level warnings for a date: size, offices and quorum. */
function boardWarnings(
  input: RegisterInput,
  on: string,
  board: BoardMember[]
): RegisterWarning[] {
  const warnings: RegisterWarning[] = [];
  const count = board.length;
  if (count < input.rules.minTrustees) {
    warnings.push({
      code: "below_minimum",
      message: `The board has ${pluralTrustees(count)}; the deed needs at least ${input.rules.minTrustees}. Until vacancies are filled the board may act only to fill them (clause 4.14).`,
      rowIds: [],
      severity: "error",
      trusteeId: null,
    });
  }
  if (count > input.rules.maxTrustees) {
    warnings.push({
      code: "above_maximum",
      message: `The board has ${pluralTrustees(count)}; the deed allows at most ${input.rules.maxTrustees} (clause 4.12).`,
      rowIds: [],
      severity: "error",
      trusteeId: null,
    });
  }
  if (!officeHolderOn(input, "managing_trustee", on)) {
    warnings.push({
      code: "no_managing_trustee",
      message:
        "No Managing Trustee is in office, so no circular resolution can be issued and no meeting can be quorate.",
      rowIds: [],
      severity: "error",
      trusteeId: null,
    });
  }
  const quorum = quorumFor(input.rules, count);
  if (count > 0 && quorum > count) {
    warnings.push({
      code: "meeting_quorum_unreachable",
      message: `A meeting needs ${quorum} trustees present, but only ${count} are in office, so no meeting can be quorate. Decide by circular resolution.`,
      rowIds: [],
      severity: "warning",
      trusteeId: null,
    });
  }
  if (
    input.rules.castingVote === "chair" &&
    !officeHolderOn(input, "president", on)
  ) {
    warnings.push({
      code: "no_casting_vote",
      message:
        "The office of President is vacant, so a tied vote at a meeting has no casting vote.",
      rowIds: [],
      severity: "info",
      trusteeId: null,
    });
  }
  return warnings;
}

/** Overlaps and gaps between rows, which hold on every date. */
function structuralWarnings(input: RegisterInput): RegisterWarning[] {
  const warnings: RegisterWarning[] = [];
  const { terms, trustees } = input;
  const offices = effectiveOffices(input);

  for (const [i, a] of offices.entries()) {
    for (const b of offices.slice(i + 1)) {
      if (a.office === b.office && overlaps(a, b)) {
        warnings.push({
          code: "office_overlap",
          message: `${nameOf(trustees, a.trusteeId)} and ${nameOf(trustees, b.trusteeId)} both hold ${TRUSTEE_OFFICE_LABELS[a.office]} on the same days. An office has one holder at a time.`,
          rowIds: [a.id, b.id],
          severity: "error",
          trusteeId: null,
        });
      }
    }
    const ownTerms = terms.filter((t) => t.trusteeId === a.trusteeId);
    if (!ownTerms.some((t) => within(t, a))) {
      warnings.push({
        code: "office_outside_term",
        message: `${nameOf(trustees, a.trusteeId)} holds ${TRUSTEE_OFFICE_LABELS[a.office]} on days outside their term as a trustee.`,
        rowIds: [a.id],
        severity: "error",
        trusteeId: a.trusteeId,
      });
    }
  }

  for (const [i, a] of terms.entries()) {
    for (const b of terms.slice(i + 1)) {
      if (a.trusteeId === b.trusteeId && overlaps(a, b)) {
        warnings.push({
          code: "term_overlap",
          message: `${nameOf(trustees, a.trusteeId)} has two terms on the same days.`,
          rowIds: [a.id, b.id],
          severity: "error",
          trusteeId: a.trusteeId,
        });
      }
    }
    if (a.basis === "co_option_4_5") {
      const last = lastDayOf(a);
      if (
        last === null ||
        termYears(a.startsOn, last) > input.rules.coOptionMaxYears + 0.01
      ) {
        warnings.push({
          code: "co_option_too_long",
          message: `${nameOf(trustees, a.trusteeId)} is co-opted for longer than ${input.rules.coOptionMaxYears} years (clause 4.5).`,
          rowIds: [a.id],
          severity: "error",
          trusteeId: a.trusteeId,
        });
      }
    }
  }
  return warnings;
}

const displayDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

/** "3 Apr 2026", for dates inside messages. */
function formatDay(isoDate: string): string {
  return displayDate.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Terms whose last day falls within 90 days of a date, and what their end does to the board. */
function endingWarnings(input: RegisterInput, on: string): RegisterWarning[] {
  const warnings: RegisterWarning[] = [];
  const horizon = addDays(on, TERM_REMINDER_DAYS[0]);
  for (const term of input.terms) {
    const last = lastDayOf(term);
    if (!(last && isHeldOn(term, on)) || last > horizon) {
      continue;
    }
    const name = nameOf(input.trustees, term.trusteeId);
    const days = daysBetween(on, last);
    const when = days === 0 ? "today" : `in ${days} days`;
    warnings.push({
      code: "term_ending_soon",
      message: `${name}'s term ends ${when} (last day ${formatDay(last)}).`,
      rowIds: [term.id],
      severity: "warning",
      trusteeId: term.trusteeId,
    });
    const after = boardOn(input, nextDay(last)).length;
    if (after < input.rules.minTrustees) {
      warnings.push({
        code: "term_end_below_minimum",
        message: `When ${name}'s term ends, the board falls to ${pluralTrustees(after)}, below the deed's minimum of ${input.rules.minTrustees}. Appoint or reappoint before ${formatDay(nextDay(last))}.`,
        rowIds: [term.id],
        severity: "error",
        trusteeId: term.trusteeId,
      });
    }
  }
  return warnings;
}

/** Start and end dates with no document behind them. */
function evidenceWarnings(input: RegisterInput): RegisterWarning[] {
  const warnings: RegisterWarning[] = [];
  const rows: {
    endedOn: string | null;
    endEvidenceDocumentId: string | null;
    id: string;
    label: string;
    startEvidenceDocumentId: string | null;
    trusteeId: string;
  }[] = [
    ...input.terms.map((t) => ({ ...t, label: "term as trustee" })),
    ...input.offices.map((o) => ({
      ...o,
      label: `office of ${TRUSTEE_OFFICE_LABELS[o.office]}`,
    })),
  ];
  for (const row of rows) {
    const missing: string[] = [];
    if (!row.startEvidenceDocumentId) {
      missing.push("start");
    }
    if (row.endedOn && !row.endEvidenceDocumentId) {
      missing.push("end");
    }
    if (missing.length > 0) {
      warnings.push({
        code: "unevidenced",
        message: `${nameOf(input.trustees, row.trusteeId)}: the ${missing.join(" and ")} of their ${row.label} has no document behind it.`,
        rowIds: [row.id],
        severity: "info",
        trusteeId: row.trusteeId,
      });
    }
  }
  return warnings;
}

const SEVERITY_ORDER: Record<RegisterWarningSeverity, number> = {
  error: 0,
  info: 2,
  warning: 1,
};

/** Everything the register page flags for a date, most severe first. */
export function registerWarnings(
  input: RegisterInput,
  on: string
): RegisterWarning[] {
  const board = boardOn(input, on);
  return [
    ...boardWarnings(input, on, board),
    ...structuralWarnings(input),
    ...endingWarnings(input, on),
    ...evidenceWarnings(input),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Whether a term's start or end, or an office's, is backed by a document. */
export function isEvidenced(row: {
  endedOn: string | null;
  endEvidenceDocumentId: string | null;
  startEvidenceDocumentId: string | null;
}): { end: boolean; start: boolean } {
  return {
    end: row.endedOn === null || row.endEvidenceDocumentId !== null,
    start: row.startEvidenceDocumentId !== null,
  };
}

/** Terms whose last day is exactly one of the reminder offsets from a date. */
export function termsDueForReminder(
  terms: readonly TermRow[],
  on: string
): { daysLeft: number; term: TermRow }[] {
  const due: { daysLeft: number; term: TermRow }[] = [];
  for (const term of terms) {
    const last = lastDayOf(term);
    if (!(last && isHeldOn(term, on))) {
      continue;
    }
    const daysLeft = daysBetween(on, last);
    if ((TERM_REMINDER_DAYS as readonly number[]).includes(daysLeft)) {
      due.push({ daysLeft, term });
    }
  }
  return due;
}

// ── Input checks for writes ─────────────────────────────────────────────────

export const TRUSTEE_NAME_MAX = 200;
export const VALIDITY_NOTE_MAX = 1000;
export const DOCUMENT_TITLE_MAX = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a string is a real calendar date in `yyyy-MM-dd`. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Problems with a term's dates on their own; overlaps are checked against the register. */
export function termDateProblem(term: {
  endedOn: string | null;
  endsOn: string | null;
  startsOn: string;
}): string | null {
  if (term.endsOn && term.endsOn < term.startsOn) {
    return "The term can't end before it starts.";
  }
  if (term.endedOn && term.endedOn <= term.startsOn) {
    return "The trustee can't cease on or before the day the term starts.";
  }
  return null;
}

/** Problems with an office's dates on their own. */
export function officeDateProblem(office: {
  endedOn: string | null;
  startsOn: string;
}): string | null {
  if (office.endedOn && office.endedOn <= office.startsOn) {
    return "The office can't end on or before the day it starts.";
  }
  return null;
}

/**
 * Rules that hold on every date and that a register change must not break:
 * two holders of one office, an office outside its holder's term, or two
 * terms of one trustee on the same days. Returns the problems the change
 * introduces; ones already in the register are left to its warnings.
 */
export function newRegisterProblems(
  before: RegisterInput,
  after: RegisterInput
): string[] {
  const blocking = new Set<RegisterWarningCode>([
    "office_overlap",
    "office_outside_term",
    "term_overlap",
  ]);
  const key = (w: RegisterWarning) =>
    `${w.code}:${[...w.rowIds].sort().join(",")}`;
  const existing = new Set(
    structuralWarnings(before)
      .filter((w) => blocking.has(w.code))
      .map(key)
  );
  return structuralWarnings(after)
    .filter((w) => blocking.has(w.code) && !existing.has(key(w)))
    .map((w) => w.message);
}

// ── Matching signers to the register ────────────────────────────────────────

/** Upper-case letters only, split into words: "Sarjun H. Hajathulla" → SARJUN H HAJATHULLA. */
function nameWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The trustee a certificate's common name belongs to. Indian DSCs carry the
 * name as on the PAN card, so each trustee's legal, PAN and Aadhaar names are
 * tried. A match needs the same words in any order; initials match a word
 * they start. Returns null when no trustee or more than one matches.
 */
export function matchSignerToTrustee(
  signerName: string | null,
  trustees: readonly { id: string; names: readonly string[] }[]
): string | null {
  if (!signerName) {
    return null;
  }
  const signer = nameWords(signerName);
  if (signer.length === 0) {
    return null;
  }
  const matches = trustees.filter((t) =>
    t.names.some((name) => sameName(signer, nameWords(name)))
  );
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

function sameName(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const remaining = [...b];
  for (const word of a) {
    const index = remaining.findIndex(
      (other) =>
        other === word ||
        (word.length === 1 && other.startsWith(word)) ||
        (other.length === 1 && word.startsWith(other))
    );
    if (index === -1) {
      return false;
    }
    remaining.splice(index, 1);
  }
  return true;
}
