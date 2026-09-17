import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { canViewKalakritiAttendees } from "@/lib/kalakriti-attendee-policy";
import { canViewKalakritiCenterDirectory } from "@/lib/kalakriti-center-registration-policy";
import { canAccessKalakritiEntries } from "@/lib/kalakriti-entry-policy";
import {
  getKalakritiScanActivities,
  type ScanActivity,
} from "@/lib/kalakriti-event-day-policy";
import { canViewKalakritiFood } from "@/lib/kalakriti-food-policy";
import { canViewKalakritiInventory } from "@/lib/kalakriti-inventory-policy";
import { canAccessKalakritiStudents } from "@/lib/kalakriti-student-policy";
import { canViewKalakritiTransport } from "@/lib/kalakriti-transport-policy";
import { canManageKalakritiVolunteers } from "@/lib/kalakriti-volunteer-policy";

export const DASHBOARD_DESTINATIONS = {
  centers: "/kalakriti/$year/centers",
  students: "/kalakriti/$year/students",
  entries: "/kalakriti/$year/competitions",
  competitions: "/kalakriti/$year/competitions",
  eligibility: "/kalakriti/$year/settings/eligibility",
  settings: "/kalakriti/$year/settings",
  venues: "/kalakriti/$year/settings/venues",
  volunteers: "/kalakriti/$year/volunteers",
  guardians: "/kalakriti/$year/guardians",
  guests: "/kalakriti/$year/guests",
  judges: "/kalakriti/$year/judges",
  food: "/kalakriti/$year/food",
  transport: "/kalakriti/$year/transport",
  inventory: "/kalakriti/$year/inventory",
  schedule: "/kalakriti/$year/schedule",
} as const;

export type DashboardDestination = keyof typeof DASHBOARD_DESTINATIONS;
export interface DashboardAction {
  id: string;
  label: string;
  destination?: DashboardDestination;
  activity?: ScanActivity;
  filter?: string;
  unavailable?: string;
}
export interface DashboardAttention extends DashboardAction {
  count: number;
  priority: number;
}

export const DASHBOARD_PHASE_COPY: Record<
  KalakritiEditionAccess["edition"]["lifecycle"],
  string
> = {
  draft: "Prepare your Edition",
  registration_open: "Keep registration moving",
  registration_locked: "Get ready for event day",
  live: "Your event-day workspace",
  archived: "Edition summary",
};

export function dashboardAccessKey(
  access: KalakritiEditionAccess,
  userId: string
) {
  return JSON.stringify([
    userId,
    access.edition.id,
    access.edition.lifecycle,
    access.isGlobalAdmin,
    access.membership?.id,
    access.membership?.kind,
    access.membership?.assignments
      .map((a) =>
        [
          a.responsibility,
          a.centerId,
          a.competitionCategoryId,
          a.competitionId,
        ].join(":")
      )
      .sort(),
  ]);
}

export function getDashboardActions(
  access: KalakritiEditionAccess
): DashboardAction[] {
  const actions: DashboardAction[] = [];
  const archived = access.edition.lifecycle === "archived";
  if (archived && !access.isGlobalAdmin) {
    return [
      { id: "schedule", label: "View schedule", destination: "schedule" },
    ];
  }
  const admin =
    access.isGlobalAdmin ||
    access.membership?.responsibilities.includes("edition_admin");
  const add = (
    allowed: boolean | undefined,
    destination: DashboardDestination,
    label: string
  ) => {
    if (allowed) actions.push({ id: destination, destination, label });
  };
  add(canAccessKalakritiStudents(access), "students", "Students");
  add(canAccessKalakritiEntries(access), "competitions", "Competitions");
  add(canViewKalakritiCenterDirectory(access), "centers", "Centers");
  add(canManageKalakritiVolunteers(access), "volunteers", "Volunteers");
  add(
    admin ||
      access.membership?.responsibilities.some(
        (r) => r === "overall_events_lead" || r === "competition_category_lead"
      ),
    "settings",
    "Settings"
  );
  add(canViewKalakritiFood(access), "food", "Food roster");
  add(canViewKalakritiTransport(access), "transport", "Transport");
  add(canViewKalakritiInventory(access), "inventory", "Inventory");
  add(canViewKalakritiAttendees(access, "guest"), "guests", "Guests");
  add(canViewKalakritiAttendees(access, "judge"), "judges", "Judges");
  add(admin, "guardians", "Guardians");
  add(
    admin && access.edition.lifecycle === "draft",
    "eligibility",
    "Eligibility"
  );
  return actions;
}

const SCAN_LABELS: Record<ScanActivity, string> = {
  transport: "Scan transport",
  check_in: "Check in people",
  meals: "Serve meals",
  attendance: "Record attendance",
  dispatch: "Dispatch inventory",
  return: "Return inventory",
};
export function getDashboardScanActions(
  access: KalakritiEditionAccess
): DashboardAction[] {
  return getKalakritiScanActivities(access).map((activity) => ({
    id: `scan-${activity}`,
    activity,
    label: SCAN_LABELS[activity],
    unavailable:
      access.edition.lifecycle !== "live" &&
      activity !== "dispatch" &&
      activity !== "return"
        ? "Available when the Edition is Live"
        : undefined,
  }));
}

export function prioritizeDashboardAttention(
  items: DashboardAttention[],
  lifecycle: string
) {
  if (lifecycle === "archived") return [];
  return [
    ...new Map(
      items.filter((item) => item.count > 0).map((item) => [item.id, item])
    ).values(),
  ]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, 5);
}
