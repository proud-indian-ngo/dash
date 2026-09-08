import { describe, expect, it } from "bun:test";

import { kalakritiOperation } from "@pi-dash/db/schema/kalakriti";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

const config = getTableConfig(kalakritiOperation);

function checkSql(name: string) {
  const constraint = config.checks.find((check) => check.name === name);
  expect(constraint).toBeDefined();
  return new PgDialect().sqlToQuery(constraint!.value).sql.replace(/\s+/g, " ");
}

describe("Kalakriti operation database invariants", () => {
  it("makes operationId unique for idempotent recording", () => {
    const index = config.indexes.find(
      (candidate) =>
        candidate.config.name === "kalakriti_operation_operationId_uidx"
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toHaveLength(1);
  });

  it("requires exactly one subject", () => {
    const sql = checkSql("kalakriti_operation_subject_chk");
    expect(sql).toContain(
      '"student_id" IS NOT NULL AND "kalakriti_operation"."membership_id" IS NULL'
    );
    expect(sql).toContain(
      '"student_id" IS NULL AND "kalakriti_operation"."membership_id" IS NOT NULL'
    );
  });

  it("requires a session for attendance and forbids it for other operation types", () => {
    const sql = checkSql("kalakriti_operation_session_chk");
    expect(sql).toContain(
      '\'competition_attendance\' AND "kalakriti_operation"."competition_session_id" IS NOT NULL'
    );
    expect(sql).toContain(
      '<> \'competition_attendance\' AND "kalakriti_operation"."competition_session_id" IS NULL'
    );
  });

  it("keeps Student, membership, and session references within an Edition", () => {
    for (const name of [
      "kalakriti_operation_edition_student_fk",
      "kalakriti_operation_edition_membership_fk",
      "kalakriti_operation_edition_session_fk",
    ]) {
      const reference = config.foreignKeys
        .find((foreignKey) => foreignKey.getName() === name)
        ?.reference();
      expect(reference?.columns).toHaveLength(2);
      expect(reference?.columns[0]?.name).toBe("edition_id");
      expect(reference?.foreignColumns[0]?.name).toBe("edition_id");
    }
  });
});
