import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

type FoodAccess = {
  isGlobalAdmin: boolean;
  edition?: { lifecycle: string };
  membership: null | {
    kind: string;
    assignments: readonly { responsibility: string; centerId: string | null }[];
  };
};

export function canViewKalakritiFood(
  access: FoodAccess | null | undefined
): boolean {
  if (!access) return false;
  if (access.isGlobalAdmin) return true;
  if (access.edition?.lifecycle === "archived") return false;
  if (access.membership?.kind === "guardian") return true;
  if (access.membership?.kind !== "volunteer") return false;
  return access.membership.assignments.some(
    (assignment) =>
      ["edition_admin", "food_lead", "food_member", "liaison_lead"].includes(
        assignment.responsibility
      ) ||
      (assignment.centerId !== null &&
        KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.some(
          (role) => role === assignment.responsibility
        ))
  );
}

export function canUndoKalakritiMeal(
  access: FoodAccess | null | undefined
): boolean {
  if (!access || access.edition?.lifecycle !== "live") return false;
  return (
    access.isGlobalAdmin ||
    (access.membership?.kind === "volunteer" &&
      access.membership.assignments.some(
        (assignment) =>
          assignment.responsibility === "edition_admin" ||
          assignment.responsibility === "food_lead"
      ))
  );
}

export function kalakritiFoodScopeKey(access: KalakritiEditionAccess): string {
  return JSON.stringify([
    access.edition.id,
    access.isGlobalAdmin,
    access.membership?.id,
    access.membership?.kind,
    access.membership?.assignments
      .map(
        (assignment) =>
          `${assignment.responsibility}:${assignment.centerId ?? ""}`
      )
      .sort(),
  ]);
}
