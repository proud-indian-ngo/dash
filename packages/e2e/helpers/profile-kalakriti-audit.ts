import { deepStrictEqual } from "node:assert";
import { writeSync } from "node:fs";

import { count, eq, sql } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";
import { summarizePostgresPlan } from "./postgres-performance";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/pi-dash-test"
) {
  throw new Error("Kalakriti audit benchmark requires local pi-dash-test");
}
const { db } = await import("@pi-dash/db");
const { user } = await import("@pi-dash/db/schema/auth");
const { kalakritiAuditEntry, kalakritiEdition } =
  await import("@pi-dash/db/schema/kalakriti");
const { KALAKRITI_RELEASE_FIXTURE_IDS: ids } =
  await import("./kalakriti-release-fixture");
const { resolveKalakritiEditionAccess } =
  await import("../../../apps/web/src/lib/server/kalakriti-edition-access");
const { resolveKalakritiAuditScope } =
  await import("../../../apps/web/src/lib/kalakriti-audit-policy");
const {
  buildKalakritiAuditItemsQuery,
  buildKalakritiAuditWhereCondition,
  getKalakritiAuditPage,
} = await import("../../../apps/web/src/lib/server/kalakriti-audit");
const [edition] = await db
  .select({ year: kalakritiEdition.year })
  .from(kalakritiEdition)
  .where(eq(kalakritiEdition.id, ids.editionId));
if (!edition) throw new Error("Release fixture missing");
const outsideCategory = "019f0000-2193-7000-8000-ffffffffffff";
await db.execute(sql`
  INSERT INTO kalakriti_audit_entry
    (id, edition_id, action, created_at, domain, target_type, target_id, metadata)
  SELECT ('019f0000-2193-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
    CASE WHEN n < 40000 THEN ${ids.editionId}::uuid ELSE ${ids.previousEditionId}::uuid END,
    'benchmark.audit', timestamp '2193-01-01' + n * interval '1 minute',
    (ARRAY['competition_configuration', 'schedule_configuration', 'student_registration', 'edition'])[n % 4 + 1],
    CASE WHEN n % 3 = 0 THEN 'competition_category' ELSE 'competition' END,
    CASE WHEN n % 3 = 0 THEN category ELSE 'benchmark-target' END,
    CASE WHEN n % 3 = 1 THEN jsonb_build_object('competitionCategoryId', category)
         WHEN n % 3 = 2 THEN jsonb_build_object('competitionCategoryIds', ARRAY[category])
         ELSE '{}'::jsonb END
  FROM generate_series(0, 40999) AS n
  CROSS JOIN LATERAL (SELECT CASE WHEN n % 8 < 4 THEN ${ids.categoryId} ELSE ${outsideCategory} END AS category) AS scope
  ON CONFLICT (id) DO NOTHING
`);
await db.execute(sql`ANALYZE ${kalakritiAuditEntry}`);
const actors = [
  { name: "super_admin", email: process.env.SUPER_ADMIN_EMAIL },
  { name: "edition_admin", email: KALAKRITI_ACTORS.editionAdmin.email },
  { name: "category_lead", email: KALAKRITI_ACTORS.categoryLead.email },
];
const results = [];
for (const actor of actors) {
  if (!actor.email) throw new Error("Benchmark actor missing");
  const [person] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, actor.email));
  if (!person) throw new Error("Benchmark actor not seeded");
  const accessStart = performance.now();
  const access = await resolveKalakritiEditionAccess({
    role: person.role ?? "unoriented_volunteer",
    userId: person.id,
    year: edition.year,
  });
  const accessMs = performance.now() - accessStart;
  const scope = access && resolveKalakritiAuditScope(access);
  if (!scope) throw new Error("Benchmark actor has no audit scope");
  const cases = [
    { name: "first", domain: null, offset: 0 },
    {
      name: "competition",
      domain: "competition_configuration" as const,
      offset: 0,
    },
    {
      name: "deep",
      domain: null,
      offset: actor.name === "category_lead" ? 5000 : 20000,
    },
  ];
  for (const scenario of cases) {
    const expectedNumbers = Array.from(
      { length: 40000 },
      (_, index) => 39999 - index
    ).filter(
      (n) =>
        (actor.name !== "category_lead" || (n % 8 < 4 && n % 4 < 2)) &&
        (scenario.domain === null || n % 4 === 0)
    );
    const expectedIds = expectedNumbers
      .slice(scenario.offset, scenario.offset + 25)
      .map(
        (n) => `019f0000-2193-7000-8000-${n.toString(16).padStart(12, "0")}`
      );
    const input = {
      domain: scenario.domain,
      editionId: ids.editionId,
      limit: 25,
      offset: scenario.offset,
      scope,
      snapshotVersion: null,
    };
    const page = await getKalakritiAuditPage(input);
    if (!page) throw new Error("Audit page denied");
    deepStrictEqual(page.total, expectedNumbers.length);
    deepStrictEqual(
      page.items.map((item) => item.id),
      expectedIds
    );
    const where = buildKalakritiAuditWhereCondition(
      ids.editionId,
      scope,
      scenario.domain,
      page.snapshotVersion
    );
    if (!where) throw new Error("Audit scope denied");
    const queries = {
      items: buildKalakritiAuditItemsQuery(where, 25, scenario.offset),
      count: db
        .select({ total: count() })
        .from(kalakritiAuditEntry)
        .where(where),
    };
    const plans = [];
    for (const [name, query] of Object.entries(queries)) {
      const samples = [];
      for (let sample = 0; sample < 3; sample++) {
        const rows = await db.execute(
          sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.getSQL()}`
        );
        const [plan] = rows[0]!["QUERY PLAN"] as {
          "Execution Time": number;
          Plan: Record<string, unknown>;
        }[];
        samples.push({
          executionMs: plan!["Execution Time"],
          plan: summarizePostgresPlan(plan!.Plan),
        });
      }
      plans.push({ name, samples });
    }
    results.push({
      actor: actor.name,
      scenario: scenario.name,
      domain: scenario.domain,
      offset: scenario.offset,
      total: page.total,
      expectedIds,
      accessMs,
      plans,
    });
  }
}
writeSync(
  1,
  `${JSON.stringify({ year: edition.year, fixtureRows: 41000, results })}\n`
);
await db.$client.end();
