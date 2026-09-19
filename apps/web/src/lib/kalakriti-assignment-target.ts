import { uuidv7 } from "uuidv7";

import type { PickerUser } from "@/functions/users-for-picker";

export function kalakritiAssignmentMutationIds(
  selectedId: string,
  people: readonly PickerUser[]
): {
  membershipId: string;
  teamEventMemberId?: string;
  userId?: string;
} {
  const person = people.find((candidate) => candidate.id === selectedId);
  if (person?.localMembership) {
    return { membershipId: selectedId };
  }
  return {
    membershipId: uuidv7(),
    teamEventMemberId: uuidv7(),
    userId: selectedId,
  };
}
