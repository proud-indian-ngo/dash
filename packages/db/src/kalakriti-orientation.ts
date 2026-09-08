import { and, eq, exists, ne, notExists } from "drizzle-orm";

import type { db } from "./index";
import { session, user } from "./schema/auth";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "./schema/kalakriti";

type OrientationTx = Pick<typeof db, "delete" | "select" | "update">;

export function kalakritiOrientationEligibility(tx: Pick<typeof db, "select">) {
  return and(
    eq(user.role, "unoriented_volunteer"),
    notExists(
      tx
        .select({ userId: kalakritiExternalIdentity.userId })
        .from(kalakritiExternalIdentity)
        .where(eq(kalakritiExternalIdentity.userId, user.id))
    ),
    exists(
      tx
        .select({ id: kalakritiEditionMembership.id })
        .from(kalakritiEditionMembership)
        .innerJoin(
          kalakritiEdition,
          eq(kalakritiEdition.id, kalakritiEditionMembership.editionId)
        )
        .where(
          and(
            eq(kalakritiEditionMembership.userId, user.id),
            eq(kalakritiEditionMembership.kind, "volunteer"),
            eq(kalakritiEditionMembership.state, "active"),
            ne(kalakritiEdition.lifecycle, "archived")
          )
        )
    )
  );
}

/** Call inside the enrollment transaction, after membership writes. */
export async function promoteKalakritiVolunteer(
  tx: OrientationTx,
  userId: string,
  now: number
): Promise<boolean> {
  const promoted = await tx
    .update(user)
    .set({ role: "volunteer", updatedAt: new Date(now) })
    .where(and(eq(user.id, userId), kalakritiOrientationEligibility(tx)))
    .returning({ id: user.id });
  if (promoted.length === 0) {
    return false;
  }

  // Revoke in the same transaction so no old-role session survives the change.
  await tx.delete(session).where(eq(session.userId, userId));
  return true;
}
