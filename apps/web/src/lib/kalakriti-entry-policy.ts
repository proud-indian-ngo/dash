import type { KalakritiStudentAccess } from "./kalakriti-student-policy";

export type EntryRegistrationAvailability =
  | "center_closed"
  | "edition_closed"
  | "loading"
  | "missing_sessions"
  | "missing_students"
  | "open";

export function canAccessKalakritiEntries(
  access: KalakritiStudentAccess
): boolean {
  return (
    access.isGlobalAdmin ||
    access.membership?.kind === "guardian" ||
    access.membership?.responsibilities.includes("edition_admin") === true ||
    access.membership?.responsibilities.includes("liaison") === true
  );
}

export function selectKalakritiEntryCenters<T extends { id: string }>(
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

export function getEntryRegistrationAvailability({
  centerEnabled,
  lifecycle,
  referenceDataLoading,
  sessionCount,
  studentCount,
}: {
  centerEnabled: boolean;
  lifecycle: string;
  referenceDataLoading: boolean;
  sessionCount: number;
  studentCount: number;
}): EntryRegistrationAvailability {
  if (lifecycle !== "registration_open") {
    return "edition_closed";
  }
  if (!centerEnabled) {
    return "center_closed";
  }
  if (referenceDataLoading) {
    return "loading";
  }
  if (studentCount === 0) {
    return "missing_students";
  }
  if (sessionCount === 0) {
    return "missing_sessions";
  }
  return "open";
}
