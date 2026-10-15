import {
  expenseChargedToValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  EXPENSE_CHARGED_TO_LABELS,
  type ExpenseCharge,
  type ExpenseChargeFields,
  expenseChargeError,
  normaliseExpenseCharge,
} from "@pi-dash/shared/expense-charge";
import type { Transaction } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { type Schema, zql } from "../schema";

type Tx = Transaction<Schema>;

/**
 * "Charged to" arguments on the request create and update mutators. Optional
 * so a client from before the field still saves; `normaliseExpenseCharge`
 * fills in the old behaviour for it.
 */
export const expenseChargeArgs = {
  chargedProgrammeId: z.string().optional(),
  chargedProjectId: z.string().optional(),
  chargedTo: z.enum(expenseChargedToValues).optional(),
};

/** Arguments of the `setChargedTo` mutators finance uses after submission. */
export const setChargedToSchema = z.object({
  chargedProgrammeId: z.string().optional(),
  chargedProjectId: z.string().optional(),
  chargedTo: z.enum(expenseChargedToValues),
  eventId: z.string().optional(),
  id: z.string(),
});

/** A posted request keeps its charge (founder decision, finance layer 3-3a). */
export const POSTED_CHARGE_MESSAGE =
  "This request is in the books, so what it is charged to can't be changed";

/**
 * Finance changes what a submitted request is charged to: finance.manage, or
 * whoever approves requests and can see everyone's (the approve rules). Not
 * on a rejected request, and never on their own: the claimant changes it
 * only by editing the request while it is pending.
 */
export function assertCanChangeCharge(
  ctx: Context | undefined,
  entity: { status: string | null; userId: string }
): asserts ctx is Context {
  assertIsLoggedIn(ctx);
  const isFinance = can(ctx, "finance.manage");
  const isApprover =
    can(ctx, "requests.approve") && can(ctx, "requests.view_all");
  if (!(isFinance || isApprover)) {
    throw new Error("Unauthorized");
  }
  if (entity.userId === ctx.userId) {
    throw new Error("You can't change what your own request is charged to");
  }
  if (entity.status === "rejected") {
    throw new Error("A rejected request can't be charged to something else");
  }
}

/** "Event · Name", "Programme · Name" or "Organisation (admin)", for history. */
async function describeCharge(tx: Tx, charge: ExpenseChargeFields) {
  switch (charge.chargedTo) {
    case "event": {
      const event = charge.eventId
        ? await tx.run(zql.teamEvent.where("id", charge.eventId).one())
        : undefined;
      return `Event · ${event?.name ?? "unknown event"}`;
    }
    case "programme": {
      const programme = charge.chargedProgrammeId
        ? await tx.run(
            zql.programme.where("id", charge.chargedProgrammeId).one()
          )
        : undefined;
      const project = charge.chargedProjectId
        ? await tx.run(zql.project.where("id", charge.chargedProjectId).one())
        : undefined;
      const name = programme?.name ?? "unknown programme";
      return `Programme · ${project ? `${name} / ${project.name}` : name}`;
    }
    case "organisation":
      return EXPENSE_CHARGED_TO_LABELS.organisation;
    default:
      return "nothing";
  }
}

/**
 * The history note for a re-charge: "Charged to: Event · X → Programme · Y".
 * Names stay in the request's history; the audit ledger records field names
 * only.
 */
export async function chargeChangeNote(
  tx: Tx,
  previous: ExpenseChargeFields,
  next: ExpenseChargeFields
): Promise<string> {
  const [from, to] = await Promise.all([
    describeCharge(tx, previous),
    describeCharge(tx, next),
  ]);
  return `Charged to: ${from} → ${to}`;
}

/**
 * Validates a charge and returns the columns to store. The programme must
 * exist and be active, and a project must belong to it and not be closed;
 * a value the request already holds stays acceptable, so a legacy row can be
 * saved unchanged. The Unallocated holder is refused for a new pick. On the
 * client the programme or project may not have synced (projects need
 * finance.view), so a missing row is only an error on the server, which the
 * database's checks back up.
 */
export async function resolveExpenseCharge(
  tx: Tx,
  input: ExpenseChargeFields,
  previous?: ExpenseChargeFields
): Promise<ExpenseCharge> {
  // A client from before the field, editing a request without an event,
  // keeps whatever programme or admin charge the request already has.
  const keepsPrevious =
    !(input.chargedTo || input.eventId) &&
    previous?.chargedTo !== undefined &&
    previous.chargedTo !== null &&
    previous.chargedTo !== "event";
  const charge = normaliseExpenseCharge(keepsPrevious ? previous : input);
  const error = expenseChargeError(charge);
  if (error) {
    throw new Error(error);
  }
  if (charge.chargedTo !== "programme" || !charge.chargedProgrammeId) {
    return charge;
  }
  const keepsProgramme =
    previous?.chargedTo === "programme" &&
    previous.chargedProgrammeId === charge.chargedProgrammeId;
  const keepsProject =
    keepsProgramme && previous?.chargedProjectId === charge.chargedProjectId;
  // Only a client from before the field lands here without a choice.
  const isLegacyFallback = !input.chargedTo;
  if (
    charge.chargedProgrammeId === PROGRAMME_IDS.unallocated &&
    !(keepsProgramme || isLegacyFallback)
  ) {
    throw new Error("Choose a real programme, not the Unallocated holder");
  }
  const onServer = tx.location === "server";
  const programme = await tx.run(
    zql.programme.where("id", charge.chargedProgrammeId).one()
  );
  if (programme) {
    if (!(programme.active || keepsProgramme)) {
      throw new Error("Choose an active programme");
    }
  } else if (onServer) {
    throw new Error("Programme not found");
  }
  if (!charge.chargedProjectId) {
    return charge;
  }
  const project = await tx.run(
    zql.project.where("id", charge.chargedProjectId).one()
  );
  if (project) {
    if (project.programmeId !== charge.chargedProgrammeId) {
      throw new Error("The project belongs to a different programme");
    }
    if (project.status === "closed" && !keepsProject) {
      throw new Error("Choose a project that is not closed");
    }
  } else if (onServer) {
    throw new Error("Project not found");
  }
  return charge;
}
