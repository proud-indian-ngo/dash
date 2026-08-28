import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

type KalakritiEventDayAccessInput = Pick<
  KalakritiEditionAccess,
  "isGlobalAdmin" | "membership"
> & { edition?: { lifecycle: string } };

const STATION_RESPONSIBILITIES = [
  "food_lead",
  "food_member",
  "hospitality_lead",
  "hospitality_member",
  "competition_volunteer",
  "competition_coordinator",
] as const satisfies readonly KalakritiResponsibility[];

function hasEditionWideTransportAccess(
  access: KalakritiEventDayAccessInput
): boolean {
  if (access.isGlobalAdmin) {
    return true;
  }
  const responsibilities = access.membership?.responsibilities ?? [];
  return (
    responsibilities.includes("edition_admin") ||
    responsibilities.includes("transport_lead")
  );
}

function hasAnyCenterTransportAssignment(
  access: KalakritiEventDayAccessInput
): boolean {
  return (
    access.membership?.assignments.some(
      (assignment) =>
        assignment.centerId !== null &&
        (
          KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES as readonly KalakritiResponsibility[]
        ).includes(assignment.responsibility)
    ) === true
  );
}

function hasAnyStationAssignment(
  access: KalakritiEventDayAccessInput
): boolean {
  return (
    access.membership?.assignments.some((assignment) =>
      (STATION_RESPONSIBILITIES as readonly KalakritiResponsibility[]).includes(
        assignment.responsibility
      )
    ) === true
  );
}

export function canAccessKalakritiEventDay(
  access: KalakritiEventDayAccessInput | null | undefined
): boolean {
  if (!access || access.edition?.lifecycle === "archived") {
    return false;
  }
  if (access.isGlobalAdmin) return true;
  if (access.membership?.kind !== "volunteer") {
    return false;
  }
  return (
    hasEditionWideTransportAccess(access) ||
    hasAnyCenterTransportAssignment(access) ||
    hasAnyStationAssignment(access)
  );
}
