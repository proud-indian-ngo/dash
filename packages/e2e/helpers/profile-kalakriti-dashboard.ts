import { writeSync } from "node:fs";

import { eq } from "drizzle-orm";

import { seedKalakritiPerformance } from "./seed-kalakriti-performance";

// The seed validates the isolated database before any server module is loaded.
const fixture = await seedKalakritiPerformance();
const { db } = await import("@pi-dash/db");
const { kalakritiCenter, kalakritiCompetition } =
  await import("@pi-dash/db/schema/kalakriti");
const { getKalakritiRegistrationDashboardProjections } =
  await import("../../../apps/web/src/lib/server/kalakriti-registration-dashboard");
const centers = await db
  .select({ id: kalakritiCenter.id })
  .from(kalakritiCenter)
  .where(eq(kalakritiCenter.editionId, fixture.editionId))
  .orderBy(kalakritiCenter.id)
  .limit(2);
const competitions = await db
  .select({ id: kalakritiCompetition.id })
  .from(kalakritiCompetition)
  .where(eq(kalakritiCompetition.editionId, fixture.editionId))
  .orderBy(kalakritiCompetition.id)
  .limit(2);
const scopes = [
  { kind: "edition" as const },
  { kind: "center" as const, centerIds: centers.map((center) => center.id) },
  {
    kind: "competition" as const,
    competitionIds: competitions.map((competition) => competition.id),
  },
  { kind: "competition_category" as const, competitionCategoryIds: null },
];
const results = [];
for (const scope of scopes) {
  const samples = [];
  for (let sample = 0; sample < 3; sample++) {
    const start = performance.now();
    const [projection] = await getKalakritiRegistrationDashboardProjections({
      editionId: fixture.editionId,
      scopes: [scope],
    });
    if (!projection) throw new Error("Dashboard projection missing");
    samples.push({
      elapsedMs: performance.now() - start,
      totals: projection.totals,
    });
  }
  results.push({ scope: scope.kind, samples });
}
writeSync(1, `${JSON.stringify(results)}\n`);
await db.$client.end();
