import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";

interface TransportAccess {
  isGlobalAdmin: boolean;
  edition?: { lifecycle: string };
  membership: {
    kind: string;
    assignments: readonly { responsibility: string; centerId: string | null }[];
  } | null;
}

export function canManageKalakritiTransport(access: TransportAccess): boolean {
  return (
    access.edition?.lifecycle !== "archived" &&
    (access.isGlobalAdmin ||
      (access.membership?.kind === "volunteer" &&
        access.membership.assignments.some((assignment) =>
          ["edition_admin", "transport_lead"].includes(
            assignment.responsibility
          )
        )))
  );
}

export function canViewKalakritiTransport(access: TransportAccess): boolean {
  if (access.isGlobalAdmin) return true;
  if (access.edition?.lifecycle === "archived") return false;
  return (
    canManageKalakritiTransport(access) ||
    access.membership?.kind === "guardian" ||
    (access.membership?.kind === "volunteer" &&
      access.membership.assignments.some(
        (assignment) =>
          assignment.centerId !== null &&
          (
            KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES as readonly string[]
          ).includes(assignment.responsibility)
      ))
  );
}
