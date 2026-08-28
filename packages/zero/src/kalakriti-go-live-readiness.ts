import {
  getKalakritiRegistrationReadiness,
  type KalakritiRegistrationReadinessBlocker,
  type KalakritiRegistrationReadinessSnapshot,
} from "./kalakriti-registration-readiness";
import { everyActiveCenterHasTransportAssignment } from "./kalakriti-transport-rules";

export interface KalakritiGoLiveReadinessBlocker {
  code:
    | KalakritiRegistrationReadinessBlocker["code"]
    | "edition_not_locked"
    | "center_registration_open"
    | "missing_overall_events_lead"
    | "missing_transport_lead"
    | "missing_food_lead"
    | "missing_transport_assignment"
    | "student_missing_credential"
    | "volunteer_missing_credential";
  message: string;
}

export interface KalakritiGoLiveReadinessSnapshot
  extends KalakritiRegistrationReadinessSnapshot {
  assignments: readonly { responsibility: string }[];
  centers: readonly {
    competitionEntryRegistrationEnabled: boolean;
    id: string;
    retiredAt: number | null;
    studentRegistrationEnabled: boolean;
  }[];
  credentials: readonly {
    membershipId: string | null;
    revokedAt: number | null;
    studentId: string | null;
  }[];
  edition: KalakritiRegistrationReadinessSnapshot["edition"] & {
    lifecycle: string;
  };
  students: readonly { id: string }[];
  transportAssignments: readonly { centerId: string }[];
  volunteerMemberships: readonly { id: string }[];
}

const REQUIRED_LEAD_ASSIGNMENTS = [
  "overall_events_lead",
  "transport_lead",
  "food_lead",
] as const;

function hasActiveCredential(
  credentials: readonly KalakritiGoLiveReadinessSnapshot["credentials"][number][],
  subject: { membershipId?: string | null; studentId?: string | null }
): boolean {
  return credentials.some(
    (credential) =>
      credential.revokedAt === null &&
      ((subject.studentId &&
        credential.studentId === subject.studentId &&
        credential.membershipId === null) ||
        (subject.membershipId &&
          credential.membershipId === subject.membershipId &&
          credential.studentId === null))
  );
}

export function getKalakritiGoLiveReadiness(
  snapshot: KalakritiGoLiveReadinessSnapshot
): KalakritiGoLiveReadinessBlocker[] {
  const blockers: KalakritiGoLiveReadinessBlocker[] = [];

  if (snapshot.edition.lifecycle !== "registration_locked") {
    blockers.push({
      code: "edition_not_locked",
      message: "Edition must be registration locked before going live",
    });
  }

  const activeCenters = snapshot.centers.filter(
    (center) => center.retiredAt === null
  );
  if (
    activeCenters.some(
      (center) =>
        center.studentRegistrationEnabled ||
        center.competitionEntryRegistrationEnabled
    )
  ) {
    blockers.push({
      code: "center_registration_open",
      message: "Every Center must have registration controls disabled",
    });
  }

  for (const registrationBlocker of getKalakritiRegistrationReadiness(
    snapshot
  )) {
    blockers.push(registrationBlocker);
  }

  const assignedResponsibilities = new Set(
    snapshot.assignments.map((assignment) => assignment.responsibility)
  );
  for (const responsibility of REQUIRED_LEAD_ASSIGNMENTS) {
    if (!assignedResponsibilities.has(responsibility)) {
      blockers.push({
        code: `missing_${responsibility}` as KalakritiGoLiveReadinessBlocker["code"],
        message: `An ${responsibility.replaceAll("_", " ")} assignment is required`,
      });
    }
  }

  if (
    !everyActiveCenterHasTransportAssignment(
      snapshot.centers,
      snapshot.transportAssignments
    )
  ) {
    blockers.push({
      code: "missing_transport_assignment",
      message: "Every active Center needs at least one transport assignment",
    });
  }

  for (const student of snapshot.students) {
    if (!hasActiveCredential(snapshot.credentials, { studentId: student.id })) {
      blockers.push({
        code: "student_missing_credential",
        message: "Every active Student needs an active Credential",
      });
      break;
    }
  }

  for (const membership of snapshot.volunteerMemberships) {
    if (
      !hasActiveCredential(snapshot.credentials, {
        membershipId: membership.id,
      })
    ) {
      blockers.push({
        code: "volunteer_missing_credential",
        message: "Every active volunteer needs an active Credential",
      });
      break;
    }
  }

  return blockers;
}
