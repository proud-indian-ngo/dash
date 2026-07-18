export interface KalakritiStudentAccess {
  isGlobalAdmin: boolean;
  membership: {
    assignments: readonly {
      centerId: string | null;
      responsibility: string;
    }[];
    kind: "guardian" | "volunteer";
    responsibilities: readonly string[];
  } | null;
}

export type StudentRegistrationAvailability =
  | "center_closed"
  | "edition_closed"
  | "loading"
  | "missing_configuration"
  | "open";

export function canAccessKalakritiStudents(
  access: KalakritiStudentAccess
): boolean {
  return (
    access.isGlobalAdmin ||
    access.membership?.kind === "guardian" ||
    access.membership?.responsibilities.includes("edition_admin") === true ||
    access.membership?.responsibilities.includes("liaison") === true
  );
}

export function selectKalakritiStudentCenters<T extends { id: string }>(
  centers: readonly T[],
  access: KalakritiStudentAccess
): T[] {
  const hasAllCenters =
    access.isGlobalAdmin ||
    access.membership?.kind === "guardian" ||
    access.membership?.responsibilities.includes("edition_admin") === true;
  if (hasAllCenters) {
    return [...centers];
  }
  const liaisonCenterIds = new Set<string>();
  for (const assignment of access.membership?.assignments ?? []) {
    if (
      assignment.responsibility === "liaison" &&
      assignment.centerId !== null
    ) {
      liaisonCenterIds.add(assignment.centerId);
    }
  }
  return centers.filter((center) => liaisonCenterIds.has(center.id));
}

export function getStudentRegistrationAvailability({
  ageCategoryCount,
  centerEnabled,
  lifecycle,
  quotaCount,
  referenceDataLoading,
}: {
  ageCategoryCount: number;
  centerEnabled: boolean;
  lifecycle: string;
  quotaCount: number;
  referenceDataLoading: boolean;
}): StudentRegistrationAvailability {
  if (lifecycle !== "registration_open") {
    return "edition_closed";
  }
  if (!centerEnabled) {
    return "center_closed";
  }
  if (referenceDataLoading) {
    return "loading";
  }
  if (ageCategoryCount === 0 || quotaCount === 0) {
    return "missing_configuration";
  }
  return "open";
}
