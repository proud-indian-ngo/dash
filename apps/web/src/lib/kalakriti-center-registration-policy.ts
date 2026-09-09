import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
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
      true ||
    (access.membership?.kind === "volunteer" &&
      access.membership.responsibilities.includes("transport_lead"))
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

export function getCenterTransportCapabilities({
  access,
  centerId,
  lifecycle,
  guardianCenterVisible = false,
}: {
  access: KalakritiCenterRegistrationAccess;
  centerId: string;
  lifecycle: string;
  guardianCenterVisible?: boolean;
}) {
  const responsibilities = new Set(access.membership?.responsibilities ?? []);
  const hasManageAccess =
    access.isGlobalAdmin ||
    (access.membership?.kind === "volunteer" &&
      (responsibilities.has("edition_admin") ||
        responsibilities.has("transport_lead")));
  const hasLiaisonReadAccess =
    access.membership?.kind === "volunteer" &&
    access.membership.assignments.some(
      (assignment) =>
        assignment.centerId === centerId &&
        (
          KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES as readonly string[]
        ).includes(assignment.responsibility)
    );
  return {
    canManageTransport: hasManageAccess && lifecycle !== "archived",
    canViewTransport:
      hasManageAccess ||
      hasLiaisonReadAccess ||
      (access.membership?.kind === "guardian" && guardianCenterVisible),
  };
}
