import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import type { KalakritiOperationRecord } from "../kalakriti-operation-rules";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import type { CenterScanTx } from "./kalakriti-center-scan-core";
import { getEditionForUpdate } from "./kalakriti-row-locks";

const input = z.object({
  editionId: z.uuid(),
  targetOperationId: z.uuid(),
  id: z.uuid(),
  operationId: z.uuid(),
  auditEntryId: z.uuid(),
  now: z.number().finite(),
});

type Operation = KalakritiOperationRecord & { recordedBy: string };

async function assertCanUndoMeal(
  tx: CenterScanTx,
  ctx: Context,
  editionId: string
) {
  if (can(ctx, "kalakriti.admin")) return;
  if (!can(ctx, "kalakriti.view")) throw new Error("Unauthorized");
  const membership = await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("kind", "volunteer")
      .where("state", "active")
      .whereExists("assignments", (assignment) =>
        assignment
          .where("editionId", editionId)
          .where("responsibility", "IN", ["edition_admin", "food_lead"])
      )
      .one()
  );
  if (!membership) throw new Error("Unauthorized");
}

export const kalakritiMealUndoMutator = defineMutator(
  input,
  async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    if (tx.location === "client") return;
    const serverTx = tx as CenterScanTx;
    // Serving uses the same Edition lock, so correction and replacement are serialized.
    const edition = await getEditionForUpdate(serverTx, args.editionId);
    if (!edition) throw new Error("Edition not found");
    const existing = (await tx.run(
      zql.kalakritiOperation.where("operationId", args.operationId).one()
    )) as Operation | undefined;
    if (existing) {
      if (
        existing.type !== "meal_correction" ||
        existing.editionId !== args.editionId ||
        existing.id !== args.id ||
        !(existing.recordedBy === ctx.userId || can(ctx, "kalakriti.admin"))
      ) {
        throw new Error("Operation ID is already in use");
      }
      const original = await tx.run(
        zql.kalakritiOperation
          .where("id", args.targetOperationId)
          .where("editionId", args.editionId)
          .one()
      );
      if (!original || original.supersededByOperationId !== existing.id)
        throw new Error("Operation ID is already in use");
      return;
    }
    if (edition.lifecycle !== "live") throw new Error("edition_not_live");
    await assertCanUndoMeal(serverTx, ctx, args.editionId);
    const original = (await tx.run(
      zql.kalakritiOperation
        .where("id", args.targetOperationId)
        .where("editionId", args.editionId)
        .one()
    )) as Operation | undefined;
    if (
      !original ||
      original.editionId !== args.editionId ||
      original.id !== args.targetOperationId
    )
      throw new Error("Meal mark not found in this Edition");
    if (original.type !== "breakfast" && original.type !== "lunch")
      throw new Error("Only meal marks can be corrected");
    if (original.supersededByOperationId !== null)
      throw new Error("Meal mark is no longer effective");
    await tx.mutate.kalakritiOperation.insert({
      id: args.id,
      editionId: args.editionId,
      operationId: args.operationId,
      studentId: original.studentId,
      membershipId: original.membershipId,
      competitionSessionId: null,
      type: "meal_correction",
      correctionReason: "meal_unserved",
      createdAt: args.now,
      occurredAt: args.now,
      recordedBy: ctx.userId,
      supersededByOperationId: null,
    });
    await tx.mutate.kalakritiOperation.update({
      id: original.id,
      supersededByOperationId: args.id,
    });
    await tx.mutate.kalakritiAuditEntry.insert({
      id: args.auditEntryId,
      editionId: args.editionId,
      actorUserId: ctx.userId,
      action: "corrected",
      domain: "event_day_operation",
      createdAt: args.now,
      targetId: original.id,
      targetType: "event_day_operation",
      reason: null,
      metadata: {
        operationId: args.operationId,
        correctionId: args.id,
        type: original.type,
      },
    });
  }
);
