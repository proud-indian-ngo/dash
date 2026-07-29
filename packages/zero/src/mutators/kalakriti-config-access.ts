import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import type { LockableKalakritiTx } from "./kalakriti-row-locks";

export async function assertCanManageKalakritiConfiguration(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }
  if (!can(ctx, "kalakriti.view")) {
    throw new Error("Unauthorized");
  }

  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as { id: string } | undefined;
  if (!membership) {
    throw new Error("Unauthorized");
  }
  const assignment = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where("responsibility", "edition_admin")
      .one()
  );
  if (!assignment) {
    throw new Error("Unauthorized");
  }
}

export async function assertCanManageKalakritiCompetitionConfiguration(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }
  if (!can(ctx, "kalakriti.view")) {
    throw new Error("Unauthorized");
  }

  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as { id: string } | undefined;
  if (!membership) {
    throw new Error("Unauthorized");
  }
  const assignment = await tx.run(
    zql.kalakritiAssignment
      .where("membershipId", membership.id)
      .where(({ or, cmp }) =>
        or(
          cmp("responsibility", "edition_admin"),
          cmp("responsibility", "overall_events_lead")
        )
      )
      .one()
  );
  if (!assignment) {
    throw new Error("Unauthorized");
  }
}

export function assertKalakritiEditionConfigurable(lifecycle: string): void {
  if (lifecycle === "live" || lifecycle === "archived") {
    throw new Error("Configuration cannot be changed in this Edition state");
  }
}

export function assertKalakritiEditionStructurallyConfigurable(
  lifecycle: string
): void {
  assertKalakritiEditionConfigurable(lifecycle);
  if (lifecycle === "registration_locked") {
    throw new Error(
      "Structural configuration cannot be changed after registration is locked"
    );
  }
}
