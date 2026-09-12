import {
  getKalakritiRegistrationReadiness,
  type KalakritiRegistrationReadinessBlocker,
  type KalakritiRegistrationReadinessSnapshot,
} from "./kalakriti-registration-readiness";
import { everyActiveCenterHasTransportAssignment } from "./kalakriti-transport-rules";

export interface KalakritiGoLiveReadinessSnapshot extends KalakritiRegistrationReadinessSnapshot {
  edition: KalakritiRegistrationReadinessSnapshot["edition"] & {
    lifecycle: string;
  };
  centers: readonly {
    id: string;
    retiredAt: number | null;
    studentRegistrationEnabled: boolean | null;
    competitionEntryRegistrationEnabled: boolean | null;
  }[];
  assignments: readonly { responsibility: string }[];
  transportAssignments: readonly {
    centerId: string;
    deletedAt: number | null;
  }[];
}
export interface KalakritiGoLiveReadinessBlocker {
  code:
    | KalakritiRegistrationReadinessBlocker["code"]
    | "edition_not_locked"
    | "center_registration_open"
    | "missing_overall_events_lead"
    | "missing_transport_lead"
    | "missing_food_lead"
    | "missing_transport_assignment";
  message: string;
}

// Assignment inputs are scoped to active volunteer memberships by both callers.
export function getKalakritiGoLiveReadiness(
  snapshot: KalakritiGoLiveReadinessSnapshot
): KalakritiGoLiveReadinessBlocker[] {
  const blockers: KalakritiGoLiveReadinessBlocker[] =
    getKalakritiRegistrationReadiness(snapshot);
  if (snapshot.edition.lifecycle !== "registration_locked")
    blockers.push({
      code: "edition_not_locked",
      message: "Edition must be registration locked before going live",
    });
  if (
    snapshot.centers.some(
      (center) =>
        center.retiredAt === null &&
        (center.studentRegistrationEnabled !== false ||
          center.competitionEntryRegistrationEnabled !== false)
    )
  )
    blockers.push({
      code: "center_registration_open",
      message: "Every active Center must have registration controls disabled",
    });
  const roles = new Set(
    snapshot.assignments.map((assignment) => assignment.responsibility)
  );
  for (const [responsibility, message] of [
    ["overall_events_lead", "An Overall Events Lead is required"],
    ["transport_lead", "A Transport Lead is required"],
    ["food_lead", "A Food Lead is required"],
  ] as const) {
    if (!roles.has(responsibility))
      blockers.push({ code: `missing_${responsibility}`, message });
  }
  if (
    !everyActiveCenterHasTransportAssignment(
      snapshot.centers,
      snapshot.transportAssignments
    )
  )
    blockers.push({
      code: "missing_transport_assignment",
      message: "Every active Center needs a transport assignment",
    });
  return blockers;
}
