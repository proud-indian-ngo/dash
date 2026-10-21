import { type ExpenseChargedTo, PROGRAMME_IDS } from "./constants";

/**
 * "Charged to" on reimbursements and vendor payments: which work an expense
 * served, independent of its expense category (what was bought). One target
 * per request; different purposes go on separate requests.
 */

export const EXPENSE_CHARGED_TO_LABELS: Record<ExpenseChargedTo, string> = {
  event: "Event",
  organisation: "Organisation (admin)",
  programme: "Programme",
};

/** Short label for tables and filters when an expense is charged to admin. */
export const ADMIN_PROGRAMME_LABEL = "Admin";

export const ORGANISATION_CHARGE_HINT =
  "Running the trust: audit, bank charges, website, trust paperwork";

export const CHARGED_TO_SPLIT_HINT =
  "One request, one purpose. Submit separate requests for different purposes.";

export interface ExpenseChargeFields {
  chargedProgrammeId?: string | null;
  chargedProjectId?: string | null;
  chargedTo?: ExpenseChargedTo | null;
  eventId?: string | null;
}

export interface ExpenseCharge {
  chargedProgrammeId: string | null;
  chargedProjectId: string | null;
  chargedTo: ExpenseChargedTo;
  eventId: string | null;
}

export interface ExpenseProgramme {
  /** True when the expense is charged to running the organisation. */
  isAdmin: boolean;
  /** Null for admin, or while an event's programme is unknown. */
  programmeId: string | null;
  projectId: string | null;
}

/**
 * The programme and project a request's money counts against. Every place
 * that derives a request's programme (tables, filters, the spending chart,
 * the financial-year export, expense posting) goes through this rule:
 * event → the event's current programme and project (finance sets an
 * event's project);
 * programme → the chosen programme and optional project;
 * organisation → admin, no programme.
 */
export function expenseProgrammeOf(request: {
  chargedProgrammeId?: string | null;
  chargedProjectId?: string | null;
  chargedTo?: ExpenseChargedTo | null;
  event?: { programmeId?: string | null; projectId?: string | null } | null;
}): ExpenseProgramme {
  switch (request.chargedTo) {
    case "organisation":
      return { isAdmin: true, programmeId: null, projectId: null };
    case "programme":
      return {
        isAdmin: false,
        programmeId: request.chargedProgrammeId ?? null,
        projectId: request.chargedProjectId ?? null,
      };
    default:
      return {
        isAdmin: false,
        programmeId: request.event?.programmeId ?? null,
        projectId: request.event?.projectId ?? null,
      };
  }
}

/**
 * Normalises what a form or an older client sends into the stored columns.
 * Without an explicit choice, a request with an event is charged to it;
 * one without falls back to the Unallocated holding programme for finance
 * to clear (only older clients omit the choice). Fields that do not belong
 * to the chosen target are cleared, so a hidden event or programme never
 * lingers on the request.
 */
export function normaliseExpenseCharge(
  input: ExpenseChargeFields
): ExpenseCharge {
  const eventId = input.eventId || null;
  const chargedTo: ExpenseChargedTo =
    input.chargedTo ?? (eventId ? "event" : "programme");
  if (chargedTo === "event") {
    return {
      chargedProgrammeId: null,
      chargedProjectId: null,
      chargedTo,
      eventId,
    };
  }
  if (chargedTo === "organisation") {
    return {
      chargedProgrammeId: null,
      chargedProjectId: null,
      chargedTo,
      eventId: null,
    };
  }
  return {
    chargedProgrammeId:
      input.chargedProgrammeId ||
      (input.chargedTo ? null : PROGRAMME_IDS.unallocated),
    chargedProjectId: input.chargedProjectId || null,
    chargedTo,
    eventId: null,
  };
}

/** The first rule a charge breaks, or null. Mirrors the database checks. */
export function expenseChargeError(charge: ExpenseCharge): string | null {
  switch (charge.chargedTo) {
    case "event":
      return charge.eventId ? null : "Choose the event this was spent on";
    case "programme":
      return charge.chargedProgrammeId
        ? null
        : "Choose the programme this was spent on";
    default:
      return null;
  }
}

/** True when the request still sits on the Unallocated holding programme. */
export function isUnallocatedCharge(request: {
  chargedProgrammeId?: string | null;
  chargedTo?: ExpenseChargedTo | null;
}): boolean {
  return (
    request.chargedTo === "programme" &&
    request.chargedProgrammeId === PROGRAMME_IDS.unallocated
  );
}
