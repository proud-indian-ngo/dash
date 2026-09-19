import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  canRecordKalakritiCompetitionAttendance,
  isKalakritiVolunteerManagementResponsibility,
} from "@pi-dash/shared/kalakriti";
import type { KalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";

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
  "dispatch",
  "return",
] as const;
export type ScanActivity = (typeof SCAN_ACTIVITIES)[number];
export const SCAN_ACTIVITY_LABELS: Record<ScanActivity, string> = {
  dispatch: "Dispatch",
  return: "Return",
  transport: "Transport",
  check_in: "Check-in",
  meals: "Meals",
  attendance: "Competition attendance",
};
export function canScanKalakritiPerson(
  operation:
    | "volunteer_check_in"
    | "competition_attendance"
    | "breakfast"
    | "lunch",
  kind: KalakritiPersonQr["type"]
): boolean {
  if (operation === "volunteer_check_in")
    return (
      kind === "volunteer" ||
      kind === "guest" ||
      kind === "judge" ||
      kind === "guardian"
    );
  if (operation === "competition_attendance") return kind === "student";
  return true;
}

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
        case "dispatch":
        case "return":
          return (
            a.responsibility === "logistics_lead" ||
            a.responsibility === "logistics_member"
          );
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
            isKalakritiVolunteerManagementResponsibility(a.responsibility) ||
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
            a.responsibility === "overall_events_lead" ||
            (a.responsibility === "competition_category_lead" &&
              a.competitionCategoryId != null) ||
            (a.competitionId !== null &&
              (a.responsibility === "competition_volunteer" ||
                a.responsibility === "competition_coordinator"))
          );
        default:
          return false;
      }
    })
  );
}

export function canScanKalakritiCompetition(
  access: ScanAccess | null | undefined,
  competition: { competitionId: string; competitionCategoryId: string | null }
): boolean {
  if (!access || access.edition?.lifecycle === "archived") return false;
  return (
    access.isGlobalAdmin ||
    (access.membership?.kind === "volunteer" &&
      canRecordKalakritiCompetitionAttendance(
        access.membership.assignments,
        competition
      ))
  );
}
