import {
  getPartyPrivate,
  type PartyPrivateView,
  revealPartyIdNumber,
  upsertPartyPrivate,
} from "@pi-dash/db/queries/party-private";
import {
  foreignSourceAssessmentValues,
  partyIdTypeValues,
} from "@pi-dash/shared/constants";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { authMiddleware } from "@/middleware/auth";

/**
 * Finance-private party data (`party_private`) stays out of the Zero schema,
 * so the directory reads and writes it through these server functions.
 * Identity rows (`party`, `party_role`) sync through Zero as usual.
 */

const partyIdSchema = z.object({ partyId: z.uuid() });

export const getPartyDetails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(partyIdSchema)
  .handler(async ({ context, data }): Promise<PartyPrivateView | null> => {
    await assertServerPermission(context.session, "donors.view");
    return await getPartyPrivate(data.partyId);
  });

/** The full identifier. Revealing it is recorded in the audit ledger. */
export const revealPartyIdentifier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(partyIdSchema)
  .handler(async ({ context, data }): Promise<{ idNumber: string | null }> => {
    await assertServerPermission(context.session, "finance.view_sensitive");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "party.identifier.reveal",
        target: { id: data.partyId, type: "party" },
      },
      async () => ({ idNumber: await revealPartyIdNumber(data.partyId) })
    );
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const savePartyDetailsSchema = z.object({
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  assessmentNote: optionalText(500),
  city: optionalText(80),
  country: z.string().trim().length(2).toUpperCase().default("IN"),
  email: z
    .union([z.literal(""), z.email()])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  foreignSourceAssessment: z.enum(foreignSourceAssessmentValues).optional(),
  /** Omit to keep the stored identifier; send "" to clear it. */
  idNumber: z.string().trim().max(40).nullable().optional(),
  idType: z.enum(partyIdTypeValues).optional(),
  nationality: optionalText(60),
  partyId: z.uuid(),
  phone: optionalText(32),
  pincode: optionalText(12),
  state: optionalText(80),
});

export const savePartyDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(savePartyDetailsSchema)
  .handler(async ({ context, data }): Promise<PartyPrivateView> => {
    await assertServerPermission(context.session, "donors.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { partyId, ...input } = data;
    if (input.idType && input.idType !== "none" && input.idNumber === "") {
      throw new Error("Enter the identifier or set the ID type to none");
    }
    const { session } = context;
    const result = await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "party.details.save",
        target: { id: partyId, type: "party" },
      },
      async () =>
        await upsertPartyPrivate(
          partyId,
          {
            ...input,
            idNumber: input.idType === "none" ? null : input.idNumber,
          },
          session.user.id
        )
    );
    return result.view;
  });
