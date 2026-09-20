export type AwardKind = "winner" | "runner_up";

export interface KalakritiAwardRecipient {
  studentId: string;
  name: string;
  humanId: string;
  gender: "male" | "female";
  version: number;
  awarded: boolean;
}

export interface KalakritiAwardEntry {
  divisionId: string;
  entryId: string;
  award: AwardKind;
  competitionName: string;
  ageCategoryName: string;
  centerId: string;
  centerName: string;
  type: "individual" | "group";
  members: KalakritiAwardRecipient[];
}

export interface KalakritiAwardsRoster {
  editionId: string;
  canWrite: boolean;
  entries: KalakritiAwardEntry[];
}

interface KalakritiAwardsAccess {
  isGlobalAdmin: boolean;
  membership: {
    kind: string;
    state?: string | null;
    assignments: readonly { responsibility: string }[];
  } | null;
}

export function canManageKalakritiAwards(access: KalakritiAwardsAccess) {
  if (access.isGlobalAdmin) return true;
  const membership = access.membership;
  if (
    membership?.kind !== "volunteer" ||
    (membership.state !== undefined && membership.state !== "active")
  )
    return false;
  return membership.assignments.some((assignment) =>
    ["edition_admin", "awards_lead", "awards_member"].includes(
      assignment.responsibility
    )
  );
}
