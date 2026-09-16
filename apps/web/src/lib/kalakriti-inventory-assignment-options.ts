import {
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";
import type {
  KalakritiAssignment,
  KalakritiCompetition,
} from "@pi-dash/zero/schema";

type InventoryAssignment = Pick<
  KalakritiAssignment,
  "competitionId" | "responsibility"
> & {
  competition?: Pick<
    KalakritiCompetition,
    "id" | "name" | "retiredAt" | "cancelledAt"
  >;
};

interface AssignmentOption {
  value: string;
  label: string;
  competitionId: string | null;
  responsibility: KalakritiResponsibility | null;
}

export function getInventoryAssignmentOptions(
  assignments: readonly InventoryAssignment[]
): AssignmentOption[] {
  const options = new Map<string, AssignmentOption>();
  for (const assignment of assignments) {
    if (assignment.competitionId) {
      const competition = assignment.competition;
      if (
        !competition ||
        competition.retiredAt !== null ||
        competition.cancelledAt !== null
      )
        continue;
      const value = `competition:${competition.id}`;
      options.set(value, {
        value,
        label: competition.name,
        competitionId: competition.id,
        responsibility: null,
      });
    } else {
      const value = `role:${assignment.responsibility}`;
      options.set(value, {
        value,
        label: KALAKRITI_RESPONSIBILITY_LABELS[assignment.responsibility],
        competitionId: null,
        responsibility: assignment.responsibility,
      });
    }
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
}
