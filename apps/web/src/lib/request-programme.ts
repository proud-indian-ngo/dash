import type { ExpenseChargedTo } from "@pi-dash/shared/constants";
import {
  ADMIN_PROGRAMME_LABEL,
  EXPENSE_CHARGED_TO_LABELS,
  expenseProgrammeOf,
  isUnallocatedCharge,
} from "@pi-dash/shared/expense-charge";
import type { Programme, TeamEvent, User } from "@pi-dash/zero/schema";

/** A programme with its lead, who approves its requests before finance. */
export type ProgrammeWithLead = Programme & { lead?: User | undefined };

/** A request's event, with the programme a request charged to it inherits. */
export type RequestEvent = TeamEvent & {
  programme?: ProgrammeWithLead | undefined;
};

/** What the request tables, filters and the spending chart read of a request. */
export interface ChargedRequest {
  chargedProgramme?: { name: string } | null;
  chargedProgrammeId?: string | null;
  chargedProjectId?: string | null;
  /** Absent on legacy advance payments, which are charged to nothing. */
  chargedTo?: ExpenseChargedTo | null;
  event?: {
    name?: string;
    programme?: { name: string } | null;
    programmeId?: string | null;
  } | null;
}

/** Filter value for requests charged to running the organisation. */
export const ADMIN_PROGRAMME_VALUE = "admin";

/**
 * Filter value: the programme id the request counts against (through
 * `expenseProgrammeOf`), "admin" for an organisation charge, or null for a
 * legacy advance or an event that has not synced yet.
 */
export function requestProgrammeId(request: ChargedRequest): string | null {
  if (!request.chargedTo) {
    return null;
  }
  const { isAdmin, programmeId } = expenseProgrammeOf(request);
  return isAdmin ? ADMIN_PROGRAMME_VALUE : programmeId;
}

/** "Admin", the programme's name, or empty while the programme loads. */
export function requestProgrammeName(request: ChargedRequest): string {
  switch (request.chargedTo) {
    case "organisation":
      return ADMIN_PROGRAMME_LABEL;
    case "programme":
      return request.chargedProgramme?.name ?? "";
    case "event":
      return request.event?.programme?.name ?? "";
    default:
      return "";
  }
}

/**
 * Facet option value: undefined until the programme's name loads, so the
 * filter never lists a raw programme id as a label.
 */
export function requestProgrammeOptionId(
  request: ChargedRequest
): string | undefined {
  return requestProgrammeName(request)
    ? (requestProgrammeId(request) ?? undefined)
    : undefined;
}

/**
 * One line naming what a request is charged to, for the approval dialog:
 * "Event · Name", "Programme · Name" or "Organisation (admin)".
 */
export function requestChargeSummary(request: ChargedRequest): string {
  switch (request.chargedTo) {
    case "event":
      return `Event · ${request.event?.name ?? "loading"}`;
    case "programme":
      return `Programme · ${request.chargedProgramme?.name ?? "loading"}`;
    case "organisation":
      return EXPENSE_CHARGED_TO_LABELS.organisation;
    default:
      return "Nothing";
  }
}

/**
 * The "To clear" filter: requests charged straight to the Unallocated
 * holding programme (legacy rows finance must re-charge). Separate from the
 * Programme filter's Unallocated, which also matches requests charged to an
 * event that sits on Unallocated.
 */
export const TO_CLEAR_FILTER = {
  label: "To clear",
  optionLabel: "Charged to Unallocated",
  path: "toClear",
  value: "charged-to-unallocated",
} as const;

/** The row's "To clear" filter value, or null. */
export function requestToClearValue(request: ChargedRequest): string | null {
  return isUnallocatedCharge(request) ? TO_CLEAR_FILTER.value : null;
}

/** The header fact: "Admin" for an organisation charge, else "Programme · Name". */
export function requestProgrammeHeader(request: ChargedRequest): string | null {
  if (request.chargedTo === "organisation") {
    return ADMIN_PROGRAMME_LABEL;
  }
  const name = requestProgrammeName(request);
  return name ? `Programme · ${name}` : null;
}
