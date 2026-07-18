import {
  canAccessKalakritiCenterRegistration,
  type KalakritiCenterRegistrationAccess,
  selectKalakritiCenterRegistrationCenters,
} from "./kalakriti-center-registration-policy";

export type KalakritiStudentAccess = KalakritiCenterRegistrationAccess;

export type StudentRegistrationAvailability =
  | "center_closed"
  | "edition_closed"
  | "loading"
  | "missing_configuration"
  | "open";

export function canAccessKalakritiStudents(
  access: KalakritiStudentAccess
): boolean {
  return canAccessKalakritiCenterRegistration(access);
}

export function selectKalakritiStudentCenters<T extends { id: string }>(
  centers: readonly T[],
  access: KalakritiStudentAccess
): T[] {
  return selectKalakritiCenterRegistrationCenters(centers, access);
}

export function canDeleteKalakritiStudent({
  entryCount,
  entryRegistrationEnabled,
}: {
  entryCount: number;
  entryRegistrationEnabled: boolean;
}): boolean {
  return entryCount === 0 || entryRegistrationEnabled;
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
