import { hasEncryptionKey } from "@pi-dash/db/encryption";
import {
  getPartyPrivate,
  type PartyPrivateView,
  revealPartyIdNumber,
  saveParty,
} from "@pi-dash/db/queries/party-private";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { saveDonorSchema } from "@/lib/donor-schema";
import { authMiddleware } from "@/middleware/auth";

/**
 * Finance-private party data (`party_private`) stays out of the Zero schema,
 * so the directory reads and writes it through these server functions.
 * Identity rows (`party`, `party_role`) sync through Zero for reading only;
 * every write goes through `saveDonor`, whose one transaction covers
 * identity, roles and private details.
 */

export interface PartyDetailsResponse {
  details: PartyPrivateView | null;
  /** False when DATA_ENCRYPTION_KEY is missing; the form then disables identifiers. */
  identifiersAvailable: boolean;
}

/** POST so the personal data in the response is never cached along the way. */
export const getPartyDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ partyId: z.uuid().nullable() }))
  .handler(async ({ context, data }): Promise<PartyDetailsResponse> => {
    // Managing implies seeing, so a role with only donors.manage can open the form.
    await assertServerAnyPermission(context.session, [
      "donors.view",
      "donors.manage",
    ]);
    return {
      details: data.partyId ? await getPartyPrivate(data.partyId) : null,
      identifiersAvailable: hasEncryptionKey(),
    };
  });

/** The full identifier. Revealing it is recorded in the audit ledger on purpose. */
export const revealPartyIdentifier = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ partyId: z.uuid() }))
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

export const saveDonor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveDonorSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    // Clearing a stored identifier is irreversible, so it gets its own action
    // ID. The read happens before the audit row is opened, which is safe
    // because saveParty rejects the save if the private row changed after the
    // editor loaded it, so the action can never describe a different state.
    const current =
      data.mode === "update" && data.idType === "none"
        ? await getPartyPrivate(data.id)
        : null;
    let action = "party.update";
    if (data.mode === "create") {
      action = "party.create";
    } else if (current?.hasIdNumber) {
      action = "party.identifier.clear";
    }
    const result = await runSessionAuditedAction(
      session,
      context.headers,
      { action, target: { id: data.id, type: "party" } },
      async () => await saveParty(data, session.user.id)
    );
    return {
      created: result.created,
      partyId: result.partyId,
      view: result.view,
    };
  });
