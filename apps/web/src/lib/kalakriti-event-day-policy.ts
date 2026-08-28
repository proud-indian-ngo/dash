import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

const CENTER_TRANSPORT_RESPONSIBILITIES = [
  "transport_coordinator",
  ...KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
] as const satisfies readonly KalakritiResponsibility[];

function hasEditionWideTransportAccess(
  access: KalakritiEditionAccess
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
  access: KalakritiEditionAccess
): boolean {
  return (
    access.membership?.assignments.some((assignment) =>
      (
        CENTER_TRANSPORT_RESPONSIBILITIES as readonly KalakritiResponsibility[]
      ).includes(assignment.responsibility)
    ) === true
  );
}

export function canAccessKalakritiEventDay(
  access: KalakritiEditionAccess | null | undefined
): boolean {
  if (!access) {
    return false;
  }
  if (access.membership?.kind === "guardian") {
    return false;
  }
  return (
    hasEditionWideTransportAccess(access) ||
    hasAnyCenterTransportAssignment(access)
  );
}
