import {
  expenseChargedToValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
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

/**
 * Finance changes what a submitted request is charged to: whoever approves
 * requests, or finance.manage. The claimant changes it only by editing the
 * request while it is pending.
 */
export function assertCanChangeCharge(
  ctx: Context | undefined
): asserts ctx is Context {
  assertIsLoggedIn(ctx);
  if (!(can(ctx, "requests.approve") || can(ctx, "finance.manage"))) {
    throw new Error("Unauthorized");
  }
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
