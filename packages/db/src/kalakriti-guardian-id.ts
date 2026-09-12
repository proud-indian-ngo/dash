import { and, eq, isNull } from "drizzle-orm";

import type { db } from "./index";
import { planKalakritiGuardianIds } from "./kalakriti-guardian-id-plan";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "./schema/kalakriti";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Membership creation/reactivation and ID allocation share the caller's transaction.
export async function ensureKalakritiGuardianHumanId(
  tx: Transaction,
  editionId: string,
  membershipId: string
): Promise<string> {
  const [edition] = await tx
    .select({
      year: kalakritiEdition.year,
      lifecycle: kalakritiEdition.lifecycle,
      nextGuardianSequence: kalakritiEdition.nextGuardianSequence,
    })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, editionId))
    .for("update");
  if (!edition) throw new Error("Edition not found");
  if (edition.lifecycle === "archived") throw new Error("Edition is archived");
  const [membership] = await tx
    .select({
      id: kalakritiEditionMembership.id,
      humanId: kalakritiEditionMembership.humanId,
      kind: kalakritiEditionMembership.kind,
      state: kalakritiEditionMembership.state,
    })
    .from(kalakritiEditionMembership)
    .where(
      and(
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.id, membershipId)
      )
    )
    .for("update");
  if (!membership || membership.kind !== "guardian")
    throw new Error("Guardian membership not found in this Edition");
  if (membership.state !== "active")
    throw new Error("Archived Guardians cannot receive yearly IDs");
  if (membership.humanId !== null) return membership.humanId;
  const reserved = await tx
    .select({ humanId: kalakritiEditionMembership.humanId })
    .from(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, editionId));
  const plan = planKalakritiGuardianIds({
    year: edition.year,
    nextGuardianSequence: edition.nextGuardianSequence,
    existingHumanIds: reserved.map((row) => row.humanId),
    count: 1,
  });
  const humanId = plan.humanIds[0]!;
  const changed = await tx
    .update(kalakritiEditionMembership)
    .set({ humanId })
    .where(
      and(
        eq(kalakritiEditionMembership.id, membershipId),
        eq(kalakritiEditionMembership.editionId, editionId),
        eq(kalakritiEditionMembership.kind, "guardian"),
        eq(kalakritiEditionMembership.state, "active"),
        isNull(kalakritiEditionMembership.humanId)
      )
    )
    .returning({ id: kalakritiEditionMembership.id });
  if (changed.length !== 1)
    throw new Error("Guardian membership changed during allocation");
  await tx
    .update(kalakritiEdition)
    .set({ nextGuardianSequence: plan.nextGuardianSequence })
    .where(eq(kalakritiEdition.id, editionId));
  return humanId;
}
