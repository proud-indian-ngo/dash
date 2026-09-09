import { KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

type ScanAccess = Pick<
  KalakritiEditionAccess,
  "isGlobalAdmin" | "membership"
> & { edition?: { lifecycle: string } };
export const SCAN_ACTIVITIES = [
  "transport",
  "check_in",
  "meals",
  "attendance",
] as const;
export type ScanActivity = (typeof SCAN_ACTIVITIES)[number];
export const SCAN_ACTIVITY_LABELS: Record<ScanActivity, string> = {
  transport: "Transport",
  check_in: "Volunteer check-in",
  meals: "Meals",
  attendance: "Competition attendance",
};
export function getKalakritiScanActivities(
  access: ScanAccess | null | undefined
): ScanActivity[] {
  if (!access || access.edition?.lifecycle === "archived") return [];
  if (access.isGlobalAdmin) return [...SCAN_ACTIVITIES];
  if (access.membership?.kind !== "volunteer") return [];
  const assignments = access.membership.assignments;
  if (assignments.some((a) => a.responsibility === "edition_admin"))
    return [...SCAN_ACTIVITIES];
  return SCAN_ACTIVITIES.filter((activity) =>
    assignments.some((a) => {
      switch (activity) {
        case "transport":
          return (
            a.responsibility === "transport_lead" ||
            (a.centerId !== null &&
              KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.some(
                (role) => role === a.responsibility
              ))
          );
        case "check_in":
          return (
            a.responsibility === "hospitality_lead" ||
            a.responsibility === "hospitality_member"
          );
        case "meals":
          return (
            a.responsibility === "food_lead" ||
            a.responsibility === "food_member"
          );
        case "attendance":
          return (
            a.competitionId !== null &&
            (a.responsibility === "competition_volunteer" ||
              a.responsibility === "competition_coordinator")
          );
        default:
          return false;
      }
    })
  );
}
