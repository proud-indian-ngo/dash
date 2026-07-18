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
    access.membership?.responsibilities.includes("liaison") === true
  );
}

export function selectKalakritiCenterRegistrationCenters<
  T extends { id: string },
>(centers: readonly T[], access: KalakritiCenterRegistrationAccess): T[] {
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
