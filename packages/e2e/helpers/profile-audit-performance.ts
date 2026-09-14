import { deepStrictEqual } from "node:assert";
import { writeSync } from "node:fs";

import { sql } from "drizzle-orm";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/pi-dash-test"
) {
  throw new Error("Audit benchmark requires a local pi-dash-test database");
}

const { db } = await import("@pi-dash/db");
const { auditLog } = await import("@pi-dash/db/schema/audit-log");
const { buildAuditLogQueries, loadAuditLog } =
  await import("../../../apps/web/src/lib/server/audit-log");
const { auditLogQuerySchema } =
  await import("../../../apps/web/src/lib/audit-query");

// Synthetic, deterministic rows belong only to the disposable test database.
await db.execute(sql`
  INSERT INTO audit_log
    (id, action, actor_name, actor_role, actor_user_id, attempted_at,
     completed_at, outcome, target_id, target_type)
  SELECT
    ('019f0000-2192-7000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
    'benchmark.action.' || (n % 20), 'Benchmark actor ' || (n % 100),
    'volunteer', 'benchmark-user-' || (n % 100),
    timestamp '2192-01-01' + n * interval '1 minute',
    timestamp '2192-01-01' + n * interval '1 minute 1 second',
    (CASE WHEN n % 10 = 0 THEN 'failure' ELSE 'success' END)::audit_outcome,
    'benchmark-target-' || n, 'benchmark-type-' || (n % 5)
  FROM generate_series(0, 49999) AS n
  ON CONFLICT (id) DO NOTHING
`);
const [indexState] = await db.execute(
  sql`SELECT to_regclass('public.audit_log_attempted_at_id_idx') IS NOT NULL AS present`
);
if (!indexState?.present) {
  throw new Error("Audit benchmark requires the pagination index migration");
}
await db.execute(sql`ANALYZE ${auditLog}`);
const [count] = await db
  .select({ total: sql<number>`count(*)::int` })
  .from(auditLog);
const [fixtureCount] = await db.execute(sql`
  SELECT count(*)::int AS total FROM audit_log
  WHERE id >= '019f0000-2192-7000-8000-000000000000'::uuid
    AND id < '019f0000-2192-7000-8000-00000000c350'::uuid
`);
if (fixtureCount?.total !== 50_000)
  throw new Error("Audit fixture count mismatch");

const cases = [
  { name: "default", params: {}, total: count!.total },
  { name: "deep-page", params: { offset: 40_000 }, total: count!.total },
  { name: "action", params: { action: "benchmark.action.0" }, total: 2500 },
  {
    name: "date",
    params: { from: "2192-01-02", to: "2192-01-02" },
    total: 1440,
  },
  { name: "search", params: { search: "benchmark-target-1234" }, total: 11 },
  {
    name: "search-broad",
    params: { search: "Benchmark actor" },
    total: 50_000,
  },
  {
    name: "search-empty",
    params: { search: "benchmark-no-matches" },
    total: 0,
  },
  {
    name: "search-past-end",
    params: { search: "benchmark-target-1234", offset: 20 },
    total: 11,
  },
  {
    name: "combined",
    params: {
      targetType: "benchmark-type-0",
      outcome: "failure",
      from: "2192-01-01",
    },
    total: 5000,
  },
];

// Retain execution evidence without statement parameters, records or credentials.
function summarizePlan(node: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "Node Type",
    "Relation Name",
    "Index Name",
    "Actual Rows",
    "Actual Loops",
    "Actual Total Time",
    "Rows Removed by Filter",
    "Shared Hit Blocks",
    "Shared Read Blocks",
    "Temp Read Blocks",
    "Temp Written Blocks",
    "Sort Method",
    "Sort Space Used",
  ];
  return {
    ...Object.fromEntries(
      keys.filter((key) => key in node).map((key) => [key, node[key]])
    ),
    ...(Array.isArray(node.Plans)
      ? { Plans: node.Plans.map(summarizePlan) }
      : {}),
  };
}

const results = [];
for (const scenario of cases) {
  const queries = buildAuditLogQueries(
    auditLogQuerySchema.parse(scenario.params)
  );
  const previousActions = db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action);
  const previousTargetTypes = db
    .selectDistinct({ targetType: auditLog.targetType })
    .from(auditLog)
    .where(sql`${auditLog.targetType} is not null`)
    .orderBy(auditLog.targetType);
  const [response, actions, targetTypes] = await Promise.all([
    loadAuditLog(auditLogQuerySchema.parse(scenario.params)),
    previousActions,
    previousTargetTypes,
  ]);
  deepStrictEqual(
    response.facets.actions,
    actions.map((row) => row.action)
  );
  deepStrictEqual(
    response.facets.targetTypes,
    targetTypes.flatMap((row) => (row.targetType ? [row.targetType] : []))
  );
  const expectedNumbers: Record<string, number[]> = {
    default: Array.from({ length: 20 }, (_, index) => 49999 - index),
    "deep-page": Array.from({ length: 20 }, (_, index) => 9999 - index),
    action: Array.from({ length: 20 }, (_, index) => 49980 - index * 20),
    date: Array.from({ length: 20 }, (_, index) => 2879 - index),
    search: [...Array.from({ length: 10 }, (_, index) => 12349 - index), 1234],
    "search-broad": Array.from({ length: 20 }, (_, index) => 49999 - index),
    "search-empty": [],
    "search-past-end": [],
    combined: Array.from({ length: 20 }, (_, index) => 49990 - index * 10),
  };
  deepStrictEqual(
    response.entries.map((row) => row.id),
    expectedNumbers[scenario.name]!.map(
      (number) =>
        `019f0000-2192-7000-8000-${number.toString(16).padStart(12, "0")}`
    )
  );
  const plans = [];
  for (const [name, query] of Object.entries({
    ...queries,
    previousActions,
    previousTargetTypes,
  })) {
    const samples = [];
    for (let sample = 0; sample < 3; sample++) {
      const rows = await db.execute(
        sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.getSQL()}`
      );
      const plan = (
        rows[0]!["QUERY PLAN"] as {
          "Execution Time": number;
          "Planning Time": number;
          Plan: Record<string, unknown>;
        }[]
      )[0]!;
      samples.push({
        executionMs: plan["Execution Time"],
        planningMs: plan["Planning Time"],
        plan: summarizePlan(plan.Plan),
      });
    }
    if (
      name === "entries" &&
      ["default", "deep-page"].includes(scenario.name)
    ) {
      for (const sample of samples) {
        if (
          !JSON.stringify(sample.plan).includes(
            '"Index Name":"audit_log_attempted_at_id_idx"'
          ) ||
          sample.plan["Temp Written Blocks"] !== 0
        ) {
          throw new Error(
            "Audit pagination must use its ordered index without a sort spill"
          );
        }
      }
    }
    plans.push({ name, samples });
  }
  results.push({ ...scenario, plans });
}
writeSync(1, `${JSON.stringify({ fixtureRows: 50_000, results })}\n`);
await db.$client.end();
