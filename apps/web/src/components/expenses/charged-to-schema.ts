import { expenseChargedToValues } from "@pi-dash/shared/constants";
import type { ExpenseChargedTo } from "@pi-dash/shared/constants";
import z from "zod";

/** "Charged to" fields shared by the reimbursement and vendor payment forms. */
export const chargedToFormFields = {
  chargedProgrammeId: z.string().optional(),
  chargedProjectId: z.string().optional(),
  chargedTo: z.enum(expenseChargedToValues, {
    message: "Choose what this is charged to",
  }),
  eventId: z.string().optional(),
};

/** The chosen target must be filled in: an event, or a programme. */
export function refineChargedTo(
  value: {
    chargedProgrammeId?: string;
    chargedTo: ExpenseChargedTo;
    eventId?: string;
  },
  ctx: z.RefinementCtx
) {
  if (value.chargedTo === "event" && !value.eventId) {
    ctx.addIssue({
      code: "custom",
      message: "Choose the event this was spent on",
      path: ["eventId"],
    });
  }
  if (value.chargedTo === "programme" && !value.chargedProgrammeId) {
    ctx.addIssue({
      code: "custom",
      message: "Choose the programme this was spent on",
      path: ["chargedProgrammeId"],
    });
  }
}

/**
 * The values to send: only the chosen target's fields, so a hidden event or
 * programme is never saved.
 */
export function chargedToPayload(value: {
  chargedProgrammeId?: string;
  chargedProjectId?: string;
  chargedTo: ExpenseChargedTo;
  eventId?: string;
}) {
  switch (value.chargedTo) {
    case "event":
      return { chargedTo: value.chargedTo, eventId: value.eventId };
    case "programme":
      return {
        chargedProgrammeId: value.chargedProgrammeId,
        chargedTo: value.chargedTo,
        ...(value.chargedProjectId
          ? { chargedProjectId: value.chargedProjectId }
          : {}),
      };
    default:
      return { chargedTo: value.chargedTo };
  }
}
