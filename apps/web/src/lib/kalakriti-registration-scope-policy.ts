import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

export type KalakritiRegistrationScope =
  | { kind: "edition" }
  | { centerIds: string[]; kind: "center" }
  | { competitionCategoryIds: string[] | null; kind: "competition_category" }
  | { competitionIds: string[]; kind: "competition" };

function sorted(values: Iterable<string>) {
  return [...new Set(values)].sort();
}

function collectAssignedScopes(
  assignments: NonNullable<KalakritiEditionAccess["membership"]>["assignments"],
  centerIds: Set<string>,
  competitionCategoryIds: Set<string>,
  competitionIds: Set<string>
) {
  let allCompetitionCategories = false;
  for (const assignment of assignments) {
    if (assignment.responsibility === "overall_events_lead") {
      allCompetitionCategories = true;
    }
    if (assignment.responsibility === "liaison" && assignment.centerId) {
      centerIds.add(assignment.centerId);
    }
    if (
      assignment.responsibility === "competition_category_lead" &&
      assignment.competitionCategoryId
    ) {
      competitionCategoryIds.add(assignment.competitionCategoryId);
    }
    if (
      assignment.responsibility === "competition_coordinator" &&
      assignment.competitionId
    ) {
      competitionIds.add(assignment.competitionId);
    }
  }
  return allCompetitionCategories;
}

export function resolveKalakritiRegistrationScopes(
  access: KalakritiEditionAccess,
  guardianCenterIds: readonly string[] = []
): KalakritiRegistrationScope[] {
  if (access.isGlobalAdmin) {
    return [{ kind: "edition" }];
  }
  if (access.edition.lifecycle === "archived" || !access.membership) {
    return [];
  }
  if (access.membership.responsibilities.includes("edition_admin")) {
    return [{ kind: "edition" }];
  }

  const centerIds = new Set(
    access.membership.kind === "guardian" ? guardianCenterIds : []
  );
  const competitionCategoryIds = new Set<string>();
  const competitionIds = new Set<string>();
  const allCompetitionCategories = collectAssignedScopes(
    access.membership.assignments,
    centerIds,
    competitionCategoryIds,
    competitionIds
  );

  const scopes: KalakritiRegistrationScope[] = [];
  if (centerIds.size > 0) {
    scopes.push({ centerIds: sorted(centerIds), kind: "center" });
  }
  if (allCompetitionCategories) {
    scopes.push({ competitionCategoryIds: null, kind: "competition_category" });
  } else if (competitionCategoryIds.size > 0) {
    scopes.push({
      competitionCategoryIds: sorted(competitionCategoryIds),
      kind: "competition_category",
    });
  }
  if (competitionIds.size > 0) {
    scopes.push({
      competitionIds: sorted(competitionIds),
      kind: "competition",
    });
  }
  return scopes;
}
