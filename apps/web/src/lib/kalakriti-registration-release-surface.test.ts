import { readdirSync } from "node:fs";
import path from "node:path";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { describe, expect, it } from "vitest";

function routeSources(root: string) {
  const sources: string[] = [];

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("-")) {
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        sources.push(
          path.relative(root, absolutePath).split(path.sep).join("/")
        );
      }
    }
  }

  visit(root);
  return sources.sort((left, right) => left.localeCompare(right));
}

function operationKeys(registry: Record<string, unknown>) {
  return Object.entries(registry)
    .filter(([namespace]) => namespace.startsWith("kalakriti"))
    .flatMap(([namespace, operations]) =>
      operations && typeof operations === "object"
        ? Object.keys(operations)
            .filter((operation) => operation !== "~")
            .map((operation) => `${namespace}.${operation}`)
        : []
    )
    .sort();
}

describe("Kalakriti Registration Release surface", () => {
  it("exposes only Registration Release Edition routes", () => {
    expect(
      routeSources(
        path.resolve(import.meta.dirname, "../routes/_app/kalakriti/$year")
      )
    ).toEqual([
      "audit.tsx",
      "centers.tsx",
      "competitions.tsx",
      "eligibility.tsx",
      "entries.tsx",
      "guardians.tsx",
      "index.tsx",
      "route.tsx",
      "students.tsx",
    ]);
    expect(
      routeSources(
        path.resolve(import.meta.dirname, "../routes/kalakriti/$year")
      )
    ).toEqual(["schedule.tsx"]);
    expect(
      routeSources(
        path.resolve(import.meta.dirname, "../routes/api/kalakriti/$year")
      )
    ).toEqual(["audit.ts", "registration-export.ts", "schedule.ts"]);
  });

  it("registers no Event-day, Results, Awards, or Inventory queries or mutations", () => {
    expect(operationKeys(queries)).toEqual([
      "kalakritiAssignment.myAccess",
      "kalakritiAssignment.roster",
      "kalakritiCenter.guardianAssignments",
      "kalakritiCenter.liaisonAssignments",
      "kalakritiCenter.visible",
      "kalakritiCompetition.categories",
      "kalakritiCompetition.competitions",
      "kalakritiCompetition.sessions",
      "kalakritiCompetition.venues",
      "kalakritiEdition.accessible",
      "kalakritiEdition.byTeamEventId",
      "kalakritiEdition.byYear",
      "kalakritiEdition.cloneSource",
      "kalakritiEdition.configurationAccessible",
      "kalakritiEdition.readiness",
      "kalakritiEligibility.ageCategories",
      "kalakritiEligibility.quotas",
      "kalakritiEntry.availableSessionsByCenter",
      "kalakritiEntry.visibleByCenter",
      "kalakritiGuardian.roster",
      "kalakritiStudent.ageCategoriesByCenter",
      "kalakritiStudent.quotasByCenter",
      "kalakritiStudent.visibleByCenter",
    ]);
    expect(operationKeys(mutators)).toEqual([
      "kalakritiAssignment.assignCompetitionCategoryLead",
      "kalakritiAssignment.assignCompetitionMember",
      "kalakritiAssignment.assignLiaison",
      "kalakritiAssignment.assignVolunteer",
      "kalakritiAssignment.remove",
      "kalakritiCenter.assignGuardian",
      "kalakritiCenter.create",
      "kalakritiCenter.delete",
      "kalakritiCenter.lockAllRegistration",
      "kalakritiCenter.removeGuardian",
      "kalakritiCenter.retire",
      "kalakritiCenter.setRegistrationControls",
      "kalakritiCenter.update",
      "kalakritiCompetition.createCategory",
      "kalakritiCompetition.createCompetition",
      "kalakritiCompetition.createSession",
      "kalakritiCompetition.createVenue",
      "kalakritiCompetition.deleteCategory",
      "kalakritiCompetition.deleteCompetition",
      "kalakritiCompetition.deleteSession",
      "kalakritiCompetition.deleteVenue",
      "kalakritiCompetition.setCategoryRetired",
      "kalakritiCompetition.setCompetitionCancelled",
      "kalakritiCompetition.setCompetitionRetired",
      "kalakritiCompetition.setSessionCancelled",
      "kalakritiCompetition.setVenueRetired",
      "kalakritiCompetition.updateCategory",
      "kalakritiCompetition.updateCompetition",
      "kalakritiCompetition.updateSession",
      "kalakritiCompetition.updateVenue",
      "kalakritiEdition.cloneConfiguration",
      "kalakritiEdition.create",
      "kalakritiEdition.transition",
      "kalakritiEdition.updateMetadata",
      "kalakritiEligibility.createAgeCategory",
      "kalakritiEligibility.deleteAgeCategory",
      "kalakritiEligibility.deleteQuota",
      "kalakritiEligibility.setQuota",
      "kalakritiEligibility.updateAgeCategory",
      "kalakritiEntry.createGroup",
      "kalakritiEntry.createIndividual",
      "kalakritiEntry.remove",
      "kalakritiEntry.replaceGroupMembers",
      "kalakritiStudent.create",
      "kalakritiStudent.delete",
      "kalakritiStudent.update",
    ]);
  });
});
