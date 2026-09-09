import { KALAKRITI_CENTER_SCAN_STAGES } from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import {
  getKalakritiCenterScanProgress,
  getKalakritiCenterTransportStatus,
} from "../kalakriti-center-scan-rules";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import {
  type CenterScanTx,
  loadLockedCenterScan,
} from "./kalakriti-center-scan-core";
import {
  assertCanRecordKalakritiOperation,
  kalakritiOperationRecordManualSchema,
  kalakritiOperationRecordSchema,
  recordKalakritiOperation,
} from "./kalakriti-operation";
import { getEditionForUpdate } from "./kalakriti-row-locks";
import { pushTransportChangedNotificationTask } from "./kalakriti-transport";

const centerStageFields = {
  centerId: z.string().uuid(),
  expectedStage: z.enum(KALAKRITI_CENTER_SCAN_STAGES),
};
const recordSchema = kalakritiOperationRecordSchema
  .omit({ type: true, sessionId: true })
  .extend(centerStageFields);
const recordManualSchema = kalakritiOperationRecordManualSchema
  .omit({ type: true, sessionId: true })
  .extend(centerStageFields);
const finalizeSchema = z.object({
  ...centerStageFields,
  editionId: z.string().uuid(),
  id: z.string().uuid(),
  auditEntryId: z.string().uuid(),
  now: z.number().finite(),
});

export const kalakritiCenterScanMutators = {
  record: defineMutator(recordSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    if (tx.location === "client") return;
    await recordKalakritiOperation(tx as CenterScanTx, ctx, {
      ...args,
      type: args.expectedStage,
    });
  }),
  recordManual: defineMutator(recordManualSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    if (tx.location === "client") return;
    await recordKalakritiOperation(tx as CenterScanTx, ctx, {
      ...args,
      type: args.expectedStage,
    });
  }),
  finalize: defineMutator(finalizeSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    if (tx.location === "client") return;
    const edition = await getEditionForUpdate(tx, args.editionId);
    if (!edition) throw new Error("Edition not found");
    if (edition.lifecycle !== "live") throw new Error("edition_not_live");
    await assertCanRecordKalakritiOperation(
      tx,
      ctx,
      args.editionId,
      args.expectedStage,
      { centerId: args.centerId, studentId: null, membershipId: null },
      null
    );
    const center = await loadLockedCenterScan(
      tx,
      args.editionId,
      args.centerId
    );
    const session = center.scanStages.find(
      (row) => row.stage === args.expectedStage
    );
    // Repeating a completed stage never finalizes the next stage.
    if (session && session.finalizedAt !== null) return;
    const progress = getKalakritiCenterScanProgress(center);
    if (progress.stage !== args.expectedStage)
      throw new Error("Center scan stage has changed");
    if (!progress.canFinalize)
      throw new Error(
        progress.stage === "pickup"
          ? "Mark at least one Student as picked up before finishing"
          : "Scan every picked-up Student before finishing"
      );
    const stageId = session?.id ?? args.id;
    if (session) {
      await tx.mutate.kalakritiCenterScanStage.update({
        id: stageId,
        finalizedAt: args.now,
        finalizedBy: ctx.userId,
      });
    } else {
      await tx.mutate.kalakritiCenterScanStage.insert({
        id: stageId,
        editionId: args.editionId,
        centerId: args.centerId,
        stage: args.expectedStage,
        createdAt: args.now,
        createdBy: ctx.userId,
        finalizedAt: args.now,
        finalizedBy: ctx.userId,
      });
    }
    const status = getKalakritiCenterTransportStatus([
      ...center.scanStages.filter((row) => row.stage !== args.expectedStage),
      { stage: args.expectedStage, finalizedAt: args.now },
    ]);
    const vehicles = await tx.run(
      zql.kalakritiTransportAssignment
        .where("editionId", args.editionId)
        .where("centerId", args.centerId)
        .where("deletedAt", "IS", null)
    );
    for (const vehicle of vehicles) {
      if (vehicle.status === status) continue;
      await tx.mutate.kalakritiTransportAssignment.update({
        id: vehicle.id,
        status,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiTransportStatusHistory.insert({
        id: uuidv7(),
        assignmentId: vehicle.id,
        editionId: args.editionId,
        actorUserId: ctx.userId,
        fromStatus: vehicle.status,
        toStatus: status,
        occurredAt: args.now,
        createdAt: args.now,
      });
      pushTransportChangedNotificationTask(tx, ctx, {
        assignmentId: vehicle.id,
        centerId: args.centerId,
        editionId: args.editionId,
        changeId: stageId,
        mutator: "kalakritiCenterScan.finalize",
      });
    }
    await tx.mutate.kalakritiAuditEntry.insert({
      id: args.auditEntryId,
      editionId: args.editionId,
      actorUserId: ctx.userId,
      domain: "center_scan",
      action: "finalized",
      targetType: "center_scan_stage",
      targetId: stageId,
      createdAt: args.now,
      reason: null,
      metadata: {
        centerId: args.centerId,
        stage: args.expectedStage,
        studentCount: progress.scannedStudents.length,
        absentCount:
          progress.stage === "pickup" ? progress.missingStudents.length : 0,
        vehicleCount: vehicles.length,
      },
    });
  }),
};
