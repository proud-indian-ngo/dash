import {
  KALAKRITI_CENTER_SCAN_STAGES,
  KALAKRITI_CENTER_TRANSPORT_LABELS,
  KALAKRITI_STUDENT_TRANSPORT_LABELS,
  type KalakritiCenterScanStage,
  type KalakritiTransportStatus,
} from "@pi-dash/shared/kalakriti";

export interface CenterScanStageRecord {
  stage: KalakritiCenterScanStage;
  finalizedAt: number | null;
}

export interface CenterScanStudent {
  id: string;
  name: string;
  humanId: string;
  operations: readonly {
    type: string;
    supersededByOperationId: string | null;
  }[];
}

export function isKalakritiCenterScanStage(
  value: string
): value is KalakritiCenterScanStage {
  return KALAKRITI_CENTER_SCAN_STAGES.some((stage) => stage === value);
}

export function getKalakritiCenterScanProgress<
  T extends CenterScanStudent,
>(center: {
  students: readonly T[];
  scanStages: readonly CenterScanStageRecord[];
}) {
  const stage =
    KALAKRITI_CENTER_SCAN_STAGES.find(
      (candidate) =>
        !center.scanStages.some(
          (session) =>
            session.stage === candidate && session.finalizedAt !== null
        )
    ) ?? null;
  const roster = center.students.filter(
    (student) =>
      stage === "pickup" ||
      student.operations.some(
        (operation) =>
          operation.type === "pickup" &&
          operation.supersededByOperationId === null
      )
  );
  const scannedStudents = roster.filter(
    (student) =>
      stage !== null &&
      student.operations.some(
        (operation) =>
          operation.type === stage && operation.supersededByOperationId === null
      )
  );
  const scannedIds = new Set(scannedStudents.map((student) => student.id));
  const missingStudents =
    stage === null
      ? []
      : roster.filter((student) => !scannedIds.has(student.id));
  return {
    stage,
    roster,
    scannedStudents,
    missingStudents,
    canFinalize:
      stage === "pickup"
        ? scannedStudents.length > 0
        : stage !== null && roster.length > 0 && missingStudents.length === 0,
  };
}

const STATUS_BY_STAGE = {
  pickup: "departed_center",
  venue_arrival: "arrived_at_venue",
  venue_departure: "departed_venue",
  drop_off: "completed",
} as const satisfies Record<KalakritiCenterScanStage, KalakritiTransportStatus>;

export function getKalakritiStudentTransportLabel(
  operations: CenterScanStudent["operations"]
) {
  let status: KalakritiTransportStatus = "planned";
  for (const stage of KALAKRITI_CENTER_SCAN_STAGES) {
    if (
      operations.some(
        (operation) =>
          operation.type === stage && operation.supersededByOperationId === null
      )
    ) {
      status = STATUS_BY_STAGE[stage];
    }
  }
  return KALAKRITI_STUDENT_TRANSPORT_LABELS[status];
}

export function getKalakritiCenterTransportLabel(
  stages: readonly CenterScanStageRecord[]
) {
  return KALAKRITI_CENTER_TRANSPORT_LABELS[
    getKalakritiCenterTransportStatus(stages)
  ];
}

export function getKalakritiCenterTransportStatus(
  stages: readonly CenterScanStageRecord[]
): KalakritiTransportStatus {
  let status: KalakritiTransportStatus = "planned";
  for (const stage of KALAKRITI_CENTER_SCAN_STAGES) {
    if (
      !stages.some(
        (session) => session.stage === stage && session.finalizedAt !== null
      )
    )
      break;
    status = STATUS_BY_STAGE[stage];
  }
  return status;
}
