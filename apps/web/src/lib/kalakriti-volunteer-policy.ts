import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

export function canManageKalakritiVolunteers(
  access: Pick<KalakritiEditionAccess, "isGlobalAdmin" | "membership">
): boolean {
  return (
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true ||
    access.membership?.responsibilities.includes("volunteer_coordinator") ===
      true
  );
}
