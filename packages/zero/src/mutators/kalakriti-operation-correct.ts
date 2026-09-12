import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import { assertIsLoggedIn } from "../permissions";
import { correctionOperations } from "../queries/kalakriti-operation";
import { zql } from "../schema";
import type { CenterScanTx } from "./kalakriti-center-scan-core";
import { getCenterForUpdate, getEditionForUpdate } from "./kalakriti-row-locks";

const input = z
  .object({
    editionId: z.uuid(),
    targetOperationId: z.uuid(),
    id: z.uuid(),
    operationId: z.uuid(),
    auditEntryId: z.uuid(),
    now: z.number().finite(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (args) => args.id !== args.targetOperationId,
    "A correction must have a new row ID"
  );
const transportTypes = new Set([
  "pickup",
  "venue_arrival",
  "venue_departure",
  "drop_off",
]);

export const kalakritiOperationCorrectMutator = defineMutator(
  input,
  async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    if (tx.location === "client") return;
    const serverTx = tx as CenterScanTx;
    const edition = await getEditionForUpdate(serverTx, args.editionId);
    // The scoped lookup authorizes the original fact, including superseded originals.
    const original = await tx.run(
      correctionOperations(args.editionId, ctx)
        .where("id", args.targetOperationId)
        .one()
    );
    if (
      !edition ||
      !original ||
      original.editionId !== args.editionId ||
      original.id !== args.targetOperationId ||
      original.type === "meal_correction"
    )
      throw new Error("Operation not found or unauthorized");
    const existing = await tx.run(
      zql.kalakritiOperation.where("operationId", args.operationId).one()
    );
    if (existing) {
      const audit = await tx.run(
        zql.kalakritiAuditEntry
          .where("id", args.auditEntryId)
          .where("editionId", args.editionId)
          .one()
      );
      if (
        existing.id !== args.id ||
        existing.editionId !== args.editionId ||
        existing.recordedBy !== ctx.userId ||
        existing.createdAt !== args.now ||
        existing.correctionReason !== args.reason ||
        original.supersededByOperationId !== existing.id ||
        existing.type !== original.type ||
        existing.studentId !== original.studentId ||
        existing.membershipId !== original.membershipId ||
        existing.competitionSessionId !== original.competitionSessionId ||
        existing.occurredAt !== original.occurredAt ||
        !audit ||
        audit.actorUserId !== ctx.userId ||
        audit.createdAt !== args.now ||
        audit.action !== "corrected" ||
        audit.domain !== "event_day_operation" ||
        audit.targetId !== original.id ||
        audit.metadata?.correctionId !== existing.id ||
        audit.metadata?.operationId !== args.operationId
      )
        throw new Error("Operation ID is already in use");
      return;
    }
    if (edition.lifecycle !== "live") throw new Error("edition_not_live");
    if (original.supersededByOperationId !== null)
      throw new Error("Operation has already been superseded");
    if (await tx.run(zql.kalakritiOperation.where("id", args.id).one()))
      throw new Error("Operation ID is already in use");
    if (transportTypes.has(original.type)) {
      const student = original.studentId
        ? await tx.run(
            zql.kalakritiStudent
              .where("id", original.studentId)
              .where("editionId", args.editionId)
              .one()
          )
        : undefined;
      const center = student
        ? await getCenterForUpdate(serverTx, student.centerId)
        : undefined;
      if (!center || center.editionId !== args.editionId)
        throw new Error("Student Center not found in this Edition");
    }
    // Only revision metadata changes: the effective operational fact is identical.
    await tx.mutate.kalakritiOperation.insert({
      ...original,
      id: args.id,
      operationId: args.operationId,
      createdAt: args.now,
      recordedBy: ctx.userId,
      correctionReason: args.reason,
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
      createdAt: args.now,
      action: "corrected",
      domain: "event_day_operation",
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
