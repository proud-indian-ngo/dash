import { readdirSync } from "node:fs";
import path from "node:path";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { describe, expect, it } from "vitest";

function routeSources(directory: string) {
  return readdirSync(directory)
    .filter(
      (file) =>
        !file.startsWith("-") && (file.endsWith(".ts") || file.endsWith(".tsx"))
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
    expect(
      Object.keys(queries)
        .filter((key) => key.startsWith("kalakriti"))
        .sort()
    ).toEqual([
      "kalakritiAssignment",
      "kalakritiCenter",
      "kalakritiCompetition",
      "kalakritiEdition",
      "kalakritiEligibility",
      "kalakritiEntry",
      "kalakritiGuardian",
      "kalakritiStudent",
    ]);
    expect(
      Object.keys(mutators)
        .filter((key) => key.startsWith("kalakriti"))
        .sort()
    ).toEqual([
      "kalakritiAssignment",
      "kalakritiCenter",
      "kalakritiCompetition",
      "kalakritiEdition",
      "kalakritiEligibility",
      "kalakritiEntry",
      "kalakritiStudent",
    ]);
  });
});
