import { isKalakritiLiaisonResponsibility } from "@pi-dash/shared/kalakriti";

import {
  canRemoveKalakritiEntries,
  canWriteKalakritiEntries,
} from "@/lib/kalakriti-entry-policy";

export function getSessionEntryPermissions({
  access,
  centerEnabled,
  lifecycle,
  registrationOpen,
}: {
  access: Parameters<typeof canWriteKalakritiEntries>[0];
  centerEnabled: boolean;
  lifecycle: string;
  registrationOpen: boolean;
}) {
  const canWriteEntries = canWriteKalakritiEntries(access);
  const removalEnabled =
    canWriteEntries &&
    canRemoveKalakritiEntries({
      centerEnabled,
      lifecycle,
    });
  return {
    canWriteEntries,
    edit: removalEnabled,
    register: canWriteEntries && registrationOpen,
    remove: removalEnabled,
    uploadMusic: canWriteEntries && lifecycle !== "archived",
  };
}

// The input Centers must already be authorized by the Center query.
export function selectWritableEntryCenters<T extends { id: string }>(
  centers: readonly T[],
  access: Parameters<typeof canWriteKalakritiEntries>[0]
): T[] {
  if (!canWriteKalakritiEntries(access)) return [];
  if (
    access.isGlobalAdmin ||
    access.membership?.kind === "guardian" ||
    access.membership?.assignments.some(
      (assignment) => assignment.responsibility === "edition_admin"
    )
  )
    return [...centers];
  return centers.filter((center) =>
    access.membership?.assignments.some(
      (assignment) =>
        assignment.centerId === center.id &&
        isKalakritiLiaisonResponsibility(assignment.responsibility)
    )
  );
}
