import type { KalakritiCenterScanStage } from "@pi-dash/shared/kalakriti";
import { uuidv7 } from "uuidv7";

import {
  type CenterScanStageRecord,
  type CenterScanStudent,
  getKalakritiCenterScanProgress,
} from "../kalakriti-center-scan-rules";
import { zql } from "../schema";
import {
  getCenterForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}
type CenterScanMutation = BivariantMutation["bivarianceHack"];
export interface CenterScanTx extends LockableKalakritiTx {
  mutate: {
    kalakritiCenterScanStage: {
      insert: CenterScanMutation;
      update: CenterScanMutation;
    };
    kalakritiOperation: { insert: CenterScanMutation };
    kalakritiAuditEntry: { insert: CenterScanMutation };
    kalakritiTransportAssignment: { update: CenterScanMutation };
    kalakritiTransportStatusHistory: { insert: CenterScanMutation };
  };
}
interface StoredCenterScanStage extends CenterScanStageRecord {
  id: string;
  createdBy: string;
  finalizedBy: string | null;
}

// Callers acquire the Edition lock first, matching registration and transport writes.
export async function loadLockedCenterScan(
  tx: LockableKalakritiTx,
  editionId: string,
  centerId: string
) {
  const center = await getCenterForUpdate(tx, centerId);
  if (!center || center.editionId !== editionId)
    throw new Error("Center not found in this Edition");
  if (center.retiredAt !== null) throw new Error("Center is retired");
  const scanStages = (await tx.run(
    zql.kalakritiCenterScanStage
      .where("editionId", editionId)
      .where("centerId", centerId)
  )) as readonly StoredCenterScanStage[];
  const students = (await tx.run(
    zql.kalakritiStudent
      .where("editionId", editionId)
      .where("centerId", centerId)
      .related("operations", (operations) =>
        operations.where("editionId", editionId)
      )
  )) as readonly CenterScanStudent[];
  return { scanStages, students };
}

export async function prepareCenterScan(
  tx: CenterScanTx,
  args: {
    editionId: string;
    centerId: string;
    stage: KalakritiCenterScanStage;
    studentId: string;
    now: number;
    actorUserId: string;
  }
) {
  const center = await loadLockedCenterScan(tx, args.editionId, args.centerId);
  const progress = getKalakritiCenterScanProgress(center);
  if (progress.stage !== args.stage)
    throw new Error("Center scan stage has changed");
  if (!progress.roster.some((student) => student.id === args.studentId))
    throw new Error("Student is not in this Center stage roster");
  if (!center.scanStages.some((session) => session.stage === args.stage)) {
    await tx.mutate.kalakritiCenterScanStage.insert({
      id: uuidv7(),
      editionId: args.editionId,
      centerId: args.centerId,
      stage: args.stage,
      createdAt: args.now,
      createdBy: args.actorUserId,
      finalizedAt: null,
      finalizedBy: null,
    });
  }
}
