/**
 * Circular resolutions: templates, the pass and fail
 * rules, numbering and the signature page layout. Pure, so the server, the
 * pages and the closing job agree. Dates are `yyyy-MM-dd` strings.
 */

import {
  type DeedRules,
  isHeldOn,
  officeHolderOn,
  type OfficeRow,
  type ResolutionThreshold,
  type TermRow,
  type TrusteeCessationBasis,
  type TrusteeOffice,
  type TrusteeTermBasis,
  trusteeCessationBasisValues,
  trusteeOfficeValues,
  trusteeTermBasisValues,
} from "./governance";

export const resolutionStatusValues = [
  "draft",
  "issued",
  "passed",
  "failed",
  "withdrawn",
] as const;
export type ResolutionStatus = (typeof resolutionStatusValues)[number];

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  draft: "Draft",
  failed: "Failed",
  issued: "Issued",
  passed: "Passed",
  withdrawn: "Withdrawn",
};

export const resolutionKindValues = ["circular", "meeting"] as const;
export type ResolutionKind = (typeof resolutionKindValues)[number];

export const resolutionResponseValues = [
  "pending",
  "assent",
  "objection",
] as const;
export type ResolutionResponse = (typeof resolutionResponseValues)[number];

export const signatureMethodValues = [
  "dsc_helper",
  "acrobat_upload",
  // Kept because the database enum has it; nothing records it.
  "esign",
  "ink_historical",
] as const;
export type SignatureMethod = (typeof signatureMethodValues)[number];

export const SIGNATURE_METHOD_LABELS: Record<SignatureMethod, string> = {
  acrobat_upload: "DSC, signed in Acrobat",
  dsc_helper: "DSC, signed with the helper",
  esign: "Aadhaar eSign",
  ink_historical: "Ink (historical)",
};

// ── Templates ───────────────────────────────────────────────────────────────

export const resolutionTemplateKeyValues = [
  "ordinary",
  "appointment",
  "cessation",
  "office_bearer",
  "bank_operation",
  "registered_office",
  "deed_amendment",
  "removal",
  "budget_approval",
  "accounts_approval",
  "auditor_appointment",
  "accumulation",
] as const;
export type ResolutionTemplateKey =
  (typeof resolutionTemplateKeyValues)[number];

/** What a passed resolution changes in the register, in the same transaction. */
export type ResolutionEffect =
  | { type: "none" }
  | {
      basis: TrusteeTermBasis;
      endsOn: string | null;
      startsOn: string;
      trusteeId: string;
      type: "term_start";
    }
  | {
      cessationBasis: Exclude<TrusteeCessationBasis, "removal_7_12">;
      endedOn: string;
      trusteeId: string;
      type: "term_end";
    }
  | {
      office: TrusteeOffice;
      startsOn: string;
      trusteeId: string;
      type: "office_start";
    }
  | {
      endedOn: string;
      hearingNote: string;
      hearingOn: string;
      trusteeId: string;
      type: "removal";
    };

export type ResolutionEffectType = ResolutionEffect["type"];

export interface ResolutionTemplate {
  /** May be issued while the board is below the deed's minimum (clause 4.14). */
  allowedBelowMinimum: boolean;
  description: string;
  effect: ResolutionEffectType;
  key: ResolutionTemplateKey;
  /** Starting text; the drafter edits it. */
  text: string;
  /** Fixed threshold; null uses the deed's (amendment) or a simple majority. */
  threshold: ResolutionThreshold | "deed_amendment";
  title: string;
}

export const RESOLUTION_TEMPLATES: Record<
  ResolutionTemplateKey,
  ResolutionTemplate
> = {
  accounts_approval: {
    allowedBelowMinimum: false,
    description:
      "Approve the audited accounts of the year that ended (annual pack), in time for the audit report.",
    effect: "none",
    key: "accounts_approval",
    text: "RESOLVED THAT the audited Balance Sheet as at 31 March [year] and the Income and Expenditure Account for the year ended on that date, together with the auditor's report, as placed before the Board, be and are hereby approved and adopted.\n\nRESOLVED FURTHER THAT the Managing Trustee be authorised to sign the accounts on behalf of the Board.",
    threshold: "majority_in_office",
    title: "Approval of the annual accounts",
  },
  accumulation: {
    allowedBelowMinimum: false,
    description:
      "Set apart income for a specific purpose for up to five years (annual pack). The accumulation statement (Form 109) is filed with this resolution.",
    effect: "none",
    key: "accumulation",
    text: "RESOLVED THAT a sum of Rs [amount] out of the income of the financial year [year] be accumulated and set apart for [specific purpose], to be applied within [period] years, and that the statement of accumulation (Form 109) be filed with the income-tax authorities.",
    threshold: "majority_in_office",
    title: "Accumulation of income",
  },
  auditor_appointment: {
    allowedBelowMinimum: false,
    description:
      "Appoint or reappoint the auditor for the year and fix their fee (annual pack).",
    effect: "none",
    key: "auditor_appointment",
    text: "RESOLVED THAT [firm], Chartered Accountants (Firm Registration No. [number]), be and is hereby appointed auditor of the Trust for the financial year [year], at a fee of Rs [amount] plus applicable taxes.",
    threshold: "majority_in_office",
    title: "Appointment of the auditor",
  },
  appointment: {
    allowedBelowMinimum: true,
    description:
      "Appoint, co-opt or reappoint a trustee. Passing it adds the term to the register.",
    effect: "term_start",
    key: "appointment",
    text: "RESOLVED THAT [name] be and is hereby appointed a Trustee of the Trust for a term from [date] to [date], and that [name] be requested to accept the trusteeship in writing.",
    threshold: "majority_in_office",
    title: "Appointment of a trustee",
  },
  budget_approval: {
    allowedBelowMinimum: false,
    description:
      "Approve the next financial year's budget before it starts (clause 7.7, annual pack).",
    effect: "none",
    key: "budget_approval",
    text: "RESOLVED THAT the budget of the Trust for the financial year [year], as placed before the Board, be and is hereby approved.",
    threshold: "majority_in_office",
    title: "Approval of the budget",
  },
  bank_operation: {
    allowedBelowMinimum: false,
    description: "Who may operate the trust's bank accounts (clause 7.18).",
    effect: "none",
    key: "bank_operation",
    text: "RESOLVED THAT the bank accounts of the Trust be operated by [names], [singly / jointly], with effect from [date].",
    threshold: "majority_in_office",
    title: "Operation of bank accounts",
  },
  cessation: {
    allowedBelowMinimum: true,
    description:
      "Record that a trustee ceased (resignation, term end, absence under clause 4.23 or death). Passing it ends the term and their offices.",
    effect: "term_end",
    key: "cessation",
    text: "RESOLVED THAT the Board records that [name] ceased to be a Trustee of the Trust with effect from [date], by [reason].",
    threshold: "majority_in_office",
    title: "Cessation of a trustee",
  },
  deed_amendment: {
    allowedBelowMinimum: false,
    description:
      "Approve an amendment to the deed (clause 9.3). Execution and registration happen on paper; the registered deed of amendment then becomes a new deed version.",
    effect: "none",
    key: "deed_amendment",
    text: "RESOLVED THAT, subject to the prior approval of the Commissioner of Income-tax, the Trust Deed be amended as set out in the annexure.",
    threshold: "deed_amendment",
    title: "Amendment of the trust deed",
  },
  office_bearer: {
    allowedBelowMinimum: false,
    description:
      "Designate a trustee to an office. Passing it starts the office and ends the previous holder's on the same day.",
    effect: "office_start",
    key: "office_bearer",
    text: "RESOLVED THAT [name] be and is hereby designated [office] of the Trust with effect from [date].",
    threshold: "majority_in_office",
    title: "Designation of an office-bearer",
  },
  ordinary: {
    allowedBelowMinimum: false,
    description: "Any other decision of the Board.",
    effect: "none",
    key: "ordinary",
    text: "RESOLVED THAT ",
    threshold: "majority_in_office",
    title: "Ordinary resolution",
  },
  registered_office: {
    allowedBelowMinimum: false,
    description: "Shift the registered office (clause 3).",
    effect: "none",
    key: "registered_office",
    text: "RESOLVED THAT the registered office of the Trust be shifted to [address] with effect from [date].",
    threshold: "majority_in_office",
    title: "Shift of the registered office",
  },
  removal: {
    allowedBelowMinimum: false,
    description:
      "Remove a trustee under clause 7.12: needs every other trustee, after a hearing, with reasons in writing.",
    effect: "removal",
    key: "removal",
    text: "RESOLVED THAT, the Board having heard [name] on [date], and for the reasons recorded in writing, [name] be and is hereby removed as a Trustee of the Trust with effect from [date].",
    threshold: "unanimous_others",
    title: "Removal of a trustee (clause 7.12)",
  },
};

/** The threshold a template uses under the deed in force. */
export function thresholdFor(
  template: ResolutionTemplate,
  rules: DeedRules
): ResolutionThreshold {
  return template.threshold === "deed_amendment"
    ? rules.amendmentThreshold
    : template.threshold;
}

/** The trustee a resolution's effect is about, if any. */
export function effectSubject(effect: ResolutionEffect): string | null {
  return effect.type === "none" ? null : effect.trusteeId;
}

/** Problems with an effect's own fields; register conflicts are checked at issue and pass. */
export function effectProblem(
  template: ResolutionTemplate,
  effect: ResolutionEffect
): string | null {
  if (effect.type !== template.effect) {
    return "The register change doesn't match the template.";
  }
  if (
    effect.type === "term_start" &&
    effect.endsOn &&
    effect.endsOn < effect.startsOn
  ) {
    return "The term can't end before it starts.";
  }
  if (effect.type === "removal" && !effect.hearingNote.trim()) {
    return "Record the hearing and the reasons before issuing a removal.";
  }
  if (effect.type === "removal" && effect.hearingOn > effect.endedOn) {
    return "The hearing must come before the removal takes effect.";
  }
  return null;
}

export const RESOLUTION_EFFECT_VALUES = {
  basis: trusteeTermBasisValues,
  cessationBasis: trusteeCessationBasisValues.filter(
    (b) => b !== "removal_7_12"
  ) as Exclude<TrusteeCessationBasis, "removal_7_12">[],
  office: trusteeOfficeValues,
};

// ── Pass and fail ───────────────────────────────────────────────────────────

export interface ResponseState {
  conflictDeclared: boolean;
  response: ResolutionResponse;
  /** An assent counts only once the trustee's signature is on the PDF. */
  signed: boolean;
  trusteeId: string;
}

export interface Tally {
  /** Signed assents. */
  assents: number;
  /** Trustees who may vote: in office at issue, not conflicted, not the subject of a removal. */
  eligible: number;
  /** Signed assents needed to pass. */
  needed: number;
  objections: number;
  outcome: "open" | "passed" | "failed";
  /** Why it failed, when it did. */
  reason: string | null;
}

/** Signed assents needed out of the eligible trustees. */
export function neededFor(
  threshold: ResolutionThreshold,
  eligible: number
): number {
  if (threshold === "two_thirds_in_office") {
    return Math.ceil((eligible * 2) / 3);
  }
  if (threshold === "unanimous_others") {
    return eligible;
  }
  return Math.floor(eligible / 2) + 1;
}

/**
 * Counts a circular's responses against its threshold. Passes when signed
 * assents reach it; fails when enough objections make it unreachable, or
 * when the response date has passed (`dueOn` before `today`).
 */
export function tallyCircular(input: {
  dueOn: string;
  responses: readonly ResponseState[];
  subjectTrusteeId: string | null;
  threshold: ResolutionThreshold;
  today: string;
}): Tally {
  const voters = input.responses.filter(
    (r) =>
      !r.conflictDeclared &&
      !(
        input.threshold === "unanimous_others" &&
        r.trusteeId === input.subjectTrusteeId
      )
  );
  const eligible = voters.length;
  const needed = neededFor(input.threshold, eligible);
  const assents = voters.filter(
    (r) => r.response === "assent" && r.signed
  ).length;
  const objections = voters.filter((r) => r.response === "objection").length;
  const base = { assents, eligible, needed, objections };
  if (eligible === 0 || needed === 0) {
    return {
      ...base,
      outcome: "failed",
      reason: "No trustee is left who can vote on it.",
    };
  }
  if (assents >= needed) {
    return { ...base, outcome: "passed", reason: null };
  }
  if (eligible - objections < needed) {
    return {
      ...base,
      outcome: "failed",
      reason: `${objections === 1 ? "1 objection" : `${objections} objections`} left too few trustees to reach ${needed}.`,
    };
  }
  if (input.today > input.dueOn) {
    return {
      ...base,
      outcome: "failed",
      reason: `Only ${assents} of the ${needed} signatures needed arrived by the response date.`,
    };
  }
  return { ...base, outcome: "open", reason: null };
}

// ── Issue ───────────────────────────────────────────────────────────────────

/**
 * Whether a trustee may issue a circular on a date: they hold the first
 * issuing office that has a holder that day (clause 4.18 names the
 * Managing Trustee; a later deed version may add fallbacks).
 */
export function mayIssueCircular(
  input: {
    offices: readonly OfficeRow[];
    rules: DeedRules;
    terms: readonly TermRow[];
  },
  trusteeId: string,
  on: string
): boolean {
  if (!input.terms.some((t) => t.trusteeId === trusteeId && isHeldOn(t, on))) {
    return false;
  }
  for (const office of input.rules.circularIssuers) {
    const holder = officeHolderOn(input, office, on);
    if (holder) {
      return holder.trusteeId === trusteeId;
    }
  }
  return false;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** The register number of a passed resolution: PI/TR/2026-27/003. */
export function formatResolutionNumber(
  fiscalYear: string,
  sequence: number
): string {
  return `PI/TR/${fiscalYear}/${String(sequence).padStart(3, "0")}`;
}

const NUMBER_PATTERN = /^PI\/TR\/(\d{4}-\d{2})\/(\d{3,})$/;

/** The year and sequence of a register number, for historical records. */
export function parseResolutionNumber(
  number: string
): { fiscalYear: string; sequence: number } | null {
  const match = NUMBER_PATTERN.exec(number.trim());
  if (!(match?.[1] && match[2])) {
    return null;
  }
  return { fiscalYear: match[1], sequence: Number(match[2]) };
}

// ── Signature page ──────────────────────────────────────────────────────────

/** A4 in PDF points. */
export const A4 = { height: 841.89, width: 595.28 } as const;

export const SIGNATURES_PER_PAGE = 5;
const BLOCK_TOP = 150;
const BLOCK_STEP = 128;
const BOX = { height: 72, left: 300, width: 247 } as const;

export interface SignatureSlot {
  /** Field name in the PDF; one per trustee. */
  fieldName: string;
  /** 0-based index among the signature pages. */
  pageOffset: number;
  /** Top of the block from the top of the page, in points. */
  top: number;
  trusteeId: string;
}

/** The signature field name for a trustee: stable, and safe in a PDF. */
export function signatureFieldName(trusteeId: string): string {
  return `Trustee_${trusteeId.replaceAll("-", "")}`;
}

/** Where each trustee's block sits on the signature pages. */
export function signatureSlots(trusteeIds: readonly string[]): SignatureSlot[] {
  return trusteeIds.map((trusteeId, index) => ({
    fieldName: signatureFieldName(trusteeId),
    pageOffset: Math.floor(index / SIGNATURES_PER_PAGE),
    top: BLOCK_TOP + (index % SIGNATURES_PER_PAGE) * BLOCK_STEP,
    trusteeId,
  }));
}

export function signaturePageCount(trustees: number): number {
  return Math.max(1, Math.ceil(trustees / SIGNATURES_PER_PAGE));
}

/** The box a slot's signature field occupies, in PDF coordinates (origin bottom left). */
export function signatureFieldBox(
  slot: SignatureSlot
): [number, number, number, number] {
  const top = slot.top + 22;
  return [
    BOX.left,
    Number((A4.height - top - BOX.height).toFixed(2)),
    BOX.left + BOX.width,
    Number((A4.height - top).toFixed(2)),
  ];
}

export const SIGNATURE_BOX = BOX;

/**
 * The annual approvals pack: the calendar items whose closing evidence is a
 * resolution, and the template each one opens.
 */
export const ANNUAL_PACK_TEMPLATES: Readonly<
  Record<string, ResolutionTemplateKey>
> = {
  accounts_approval: "accounts_approval",
  accumulation: "accumulation",
  auditor_appointment: "auditor_appointment",
  budget: "budget_approval",
};

export const RESOLUTION_TITLE_MAX = 200;
export const RESOLUTION_TEXT_MAX = 20_000;
export const OBJECTION_REASON_MAX = 1000;
/** Default days between issue and the response date. */
export const DEFAULT_RESPONSE_DAYS = 7;
/** Signing or objecting needs a sign-in this recent, so shared laptops can't vote. */
export const VOTE_SESSION_MAX_AGE_MS = 10 * 60 * 1000;
/** The refusal the client recognises to ask for the password again. */
export const VOTE_REAUTH_MESSAGE =
  "For your security, sign in again before you vote or sign.";
