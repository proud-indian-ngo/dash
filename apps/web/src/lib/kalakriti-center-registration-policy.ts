import {
  isKalakritiLiaisonResponsibility,
  membershipHasKalakritiLiaisonAccess,
} from "@pi-dash/shared/kalakriti";

export interface KalakritiCenterRegistrationAccess {
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

export function canAccessKalakritiCenterRegistration(
  access: KalakritiCenterRegistrationAccess
): boolean {
  return (
    access.isGlobalAdmin ||
    access.membership?.kind === "guardian" ||
    access.membership?.responsibilities.includes("edition_admin") === true ||
    membershipHasKalakritiLiaisonAccess(
      access.membership?.responsibilities ?? []
    )
  );
}

export function canViewKalakritiCenterDirectory(
  access: KalakritiCenterRegistrationAccess
): boolean {
  return (
    canAccessKalakritiCenterRegistration(access) ||
    access.membership?.responsibilities.includes("volunteer_coordinator") ===
      true
  );
}

export function selectKalakritiCenterRegistrationCenters<
  T extends { id: string },
>(centers: readonly T[], access: KalakritiCenterRegistrationAccess): T[] {
  const hasAllCenters =
    access.isGlobalAdmin ||
    access.membership?.kind === "guardian" ||
    access.membership?.responsibilities.includes("edition_admin") === true ||
    access.membership?.responsibilities.includes("liaison_lead") === true;
  if (hasAllCenters) {
    return [...centers];
  }
  const liaisonCenterIds = new Set<string>();
  for (const assignment of access.membership?.assignments ?? []) {
    if (
      isKalakritiLiaisonResponsibility(assignment.responsibility) &&
      assignment.centerId !== null
    ) {
      liaisonCenterIds.add(assignment.centerId);
    }
  }
  return centers.filter((center) => liaisonCenterIds.has(center.id));
}
