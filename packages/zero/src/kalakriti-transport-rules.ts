import {
  KALAKRITI_TRANSPORT_STATUSES,
  type KalakritiTransportStatus,
} from "@pi-dash/shared/kalakriti";

export function getNextKalakritiTransportStatus(
  current: KalakritiTransportStatus
): KalakritiTransportStatus | null {
  const index = KALAKRITI_TRANSPORT_STATUSES.indexOf(current);
  if (index < 0 || index >= KALAKRITI_TRANSPORT_STATUSES.length - 1) {
    return null;
  }
  return KALAKRITI_TRANSPORT_STATUSES[index + 1] ?? null;
}

export function canAdvanceKalakritiTransportStatus(
  from: KalakritiTransportStatus,
  to: KalakritiTransportStatus
): boolean {
  return getNextKalakritiTransportStatus(from) === to;
}

export interface KalakritiTransportReadinessCenter {
  id: string;
  retiredAt: number | null;
}

export function everyActiveCenterHasTransportAssignment(
  centers: readonly KalakritiTransportReadinessCenter[],
  assignments: readonly { centerId: string }[]
): boolean {
  const activeCenterIds = centers
    .filter((center) => center.retiredAt === null)
    .map((center) => center.id);
  if (activeCenterIds.length === 0) {
    return false;
  }
  const centersWithAssignments = new Set(
    assignments.map((assignment) => assignment.centerId)
  );
  return activeCenterIds.every((centerId) =>
    centersWithAssignments.has(centerId)
  );
}
