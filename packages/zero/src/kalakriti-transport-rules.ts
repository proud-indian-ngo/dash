export interface KalakritiTransportReadinessCenter {
  id: string;
  retiredAt: number | null;
}

export function everyActiveCenterHasTransportAssignment(
  centers: readonly KalakritiTransportReadinessCenter[],
  assignments: readonly { centerId: string; deletedAt: number | null }[]
): boolean {
  const activeCenterIds = centers
    .filter((center) => center.retiredAt === null)
    .map((center) => center.id);
  if (activeCenterIds.length === 0) {
    return false;
  }
  const centersWithAssignments = new Set(
    assignments
      .filter((assignment) => assignment.deletedAt === null)
      .map((assignment) => assignment.centerId)
  );
  return activeCenterIds.every((centerId) =>
    centersWithAssignments.has(centerId)
  );
}
