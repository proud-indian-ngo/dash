import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { KalakritiAuditScope } from "@/lib/kalakriti-audit-policy";

const auditQueryCalls = vi.hoisted(
  () => [] as Array<{ params: unknown[]; sql: string }>
);

vi.mock("@pi-dash/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    db: drizzle((query, params) => {
      auditQueryCalls.push({ params, sql: query });
      return Promise.resolve({
        rows: query.includes("pg_current_snapshot")
          ? [{ snapshotVersion: "100:110:105,106" }]
          : [],
      });
    }),
  };
});

import {
  buildKalakritiAuditItemsQuery,
  buildKalakritiAuditWhereCondition,
  getKalakritiAuditPage,
} from "./kalakriti-audit";

const dialect = new PgDialect();

function requireCondition(condition: SQL | null): SQL {
  if (!condition) {
    throw new Error("Expected an audit query condition");
  }
  return condition;
}

const adminScope: KalakritiAuditScope = {
  categoryScopedDomains: [],
  competitionCategoryIds: [],
  domains: ["edition", "schedule_configuration"],
  fullEdition: true,
};

describe("Kalakriti audit query", () => {
  it("captures one MVCC snapshot and reuses it for later pages", async () => {
    auditQueryCalls.length = 0;
    const firstPage = await getKalakritiAuditPage({
      domain: "edition",
      editionId: "edition-1",
      limit: 25,
      offset: 0,
      scope: adminScope,
      snapshotVersion: null,
    });

    expect(firstPage?.snapshotVersion).toBe("100:110:105,106");
    expect(
      auditQueryCalls.filter(({ sql: query }) =>
        query.includes("pg_current_snapshot")
      )
    ).toHaveLength(1);
    const firstPageQueries = auditQueryCalls.filter(({ sql: query }) =>
      query.includes("pg_visible_in_snapshot")
    );
    expect(firstPageQueries).toHaveLength(2);
    expect(
      firstPageQueries.every(({ params }) => params.includes("100:110:105,106"))
    ).toBe(true);

    auditQueryCalls.length = 0;
    await getKalakritiAuditPage({
      domain: "edition",
      editionId: "edition-1",
      limit: 25,
      offset: 25,
      scope: adminScope,
      snapshotVersion: "100:110:105,106",
    });

    expect(
      auditQueryCalls.some(({ sql: query }) =>
        query.includes("pg_current_snapshot")
      )
    ).toBe(false);
    expect(
      auditQueryCalls.filter(({ sql: query }) =>
        query.includes("pg_visible_in_snapshot")
      )
    ).toHaveLength(2);
  });

  it("uses the PostgreSQL visibility snapshot instead of audit timestamps", () => {
    const where = buildKalakritiAuditWhereCondition(
      "edition-1",
      adminScope,
      null,
      "100:110:105,106"
    );

    const query = dialect.sqlToQuery(requireCondition(where));
    expect(query.sql).toContain("pg_visible_in_snapshot");
    expect(query.sql).toContain('"kalakriti_audit_entry"."xmin"');
    expect(query.sql).not.toContain("created_at <");
    expect(query.params).toContain("100:110:105,106");
  });

  it("binds category-scoped schedule rows to immutable audit metadata", () => {
    const where = buildKalakritiAuditWhereCondition(
      "edition-1",
      {
        categoryScopedDomains: ["schedule_configuration"],
        competitionCategoryIds: ["category-1"],
        domains: ["schedule_configuration"],
        fullEdition: false,
      },
      "schedule_configuration",
      "100:100:"
    );

    const query = dialect.sqlToQuery(requireCondition(where));
    expect(query.sql).not.toContain('"kalakriti_competition"');
    expect(query.sql).not.toContain('"kalakriti_competition_session"');
    expect(query.sql).toContain("competitionCategoryId");
    expect(query.sql).toContain("competitionCategoryIds");
    expect(query.params).toContain("category-1");
  });

  it("rejects domains outside the resolved Lead scope", () => {
    expect(
      buildKalakritiAuditWhereCondition(
        "edition-1",
        {
          categoryScopedDomains: [],
          competitionCategoryIds: [],
          domains: ["volunteer_assignment"],
          fullEdition: false,
        },
        "student_registration",
        "100:100:"
      )
    ).toBeNull();
  });

  it("orders by the complete stable tuple before applying the page window", () => {
    const where = buildKalakritiAuditWhereCondition(
      "edition-1",
      adminScope,
      "edition",
      "100:100:"
    );

    const query = buildKalakritiAuditItemsQuery(
      requireCondition(where),
      25,
      50
    ).toSQL();
    expect(query.sql).toContain(
      'order by "kalakriti_audit_entry"."created_at" desc, "kalakriti_audit_entry"."id" desc'
    );
    expect(query.params.slice(-2)).toEqual([25, 50]);
  });
});
