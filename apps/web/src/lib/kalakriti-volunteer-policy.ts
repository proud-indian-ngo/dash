import { isKalakritiVolunteerManagementResponsibility } from "@pi-dash/shared/kalakriti";

interface VolunteerManagerAccess {
  isGlobalAdmin: boolean;
  membership?: null | { responsibilities: readonly string[] };
}

interface VolunteerAccess extends VolunteerManagerAccess {
  edition: { lifecycle: string | null };
}

export function canManageKalakritiVolunteers(
  access: VolunteerManagerAccess
): boolean {
  return (
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin") === true ||
    access.membership?.responsibilities.includes("volunteer_coordinator") ===
      true
  );
}

export function canViewKalakritiVolunteers(access: VolunteerAccess): boolean {
  if (access.isGlobalAdmin) return true;
  if (canManageKalakritiVolunteers(access)) return true;
  if (access.edition.lifecycle === "archived") return false;
  return (
    access.membership?.responsibilities.includes(
      "volunteer_management_volunteer"
    ) === true
  );
}

export function canRegisterKalakritiIdCards(access: VolunteerAccess): boolean {
  if (access.edition.lifecycle === "archived") return false;
  if (access.isGlobalAdmin) return true;
  return (
    access.membership?.responsibilities.some((responsibility) =>
      responsibility === "edition_admin"
        ? true
        : isKalakritiVolunteerManagementResponsibility(responsibility)
    ) === true
  );
}
