import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import type { LockableKalakritiTx } from "./kalakriti-row-locks";

interface ActiveMembership {
  id: string;
  kind: "guardian" | "volunteer";
}

async function getActiveMembership(
  tx: LockableKalakritiTx,
  ctx: Context,
  editionId: string
): Promise<ActiveMembership | undefined> {
  return (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as ActiveMembership | undefined;
}

export async function assertCanManageKalakritiStudents(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  centerId: string
): Promise<{ isEditionAdmin: boolean }> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return { isEditionAdmin: true };
  }
  if (!can(ctx, "kalakriti.view")) {
    throw new Error("Unauthorized");
  }
  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }

  const editionAdmin = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "edition_admin")
      .one()
  );
  if (editionAdmin) {
    return { isEditionAdmin: true };
  }

  const scopedAccess =
    membership.kind === "guardian"
      ? await tx.run(
          zql.kalakritiGuardianCenter
            .where("membershipId", membership.id)
            .where("centerId", centerId)
            .one()
        )
      : await tx.run(
          zql.kalakritiAssignment
            .where("membershipId", membership.id)
            .where("responsibility", "liaison")
            .where("centerId", centerId)
            .one()
        );
  if (!scopedAccess) {
    throw new Error("Unauthorized for this Center");
  }
  return { isEditionAdmin: false };
}
