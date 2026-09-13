import { describe, expect, it } from "bun:test";

import {
  kalakritiAttendee,
  kalakritiJudgeAssignment,
  kalakritiOperation,
} from "@pi-dash/db/schema/kalakriti";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

const config = getTableConfig(kalakritiOperation);

function checkSql(name: string) {
  const constraint = config.checks.find((check) => check.name === name);
  expect(constraint).toBeDefined();
  return new PgDialect().sqlToQuery(constraint!.value).sql.replace(/\s+/g, " ");
}

describe("Kalakriti attendee database invariants", () => {
  it("keeps yearly IDs unique and contacts outside login identities", () => {
    const attendee = getTableConfig(kalakritiAttendee);
    expect(
      attendee.indexes.find(
        (index) => index.config.name === "kalakriti_attendee_humanId_uidx"
      )?.config.unique
    ).toBe(true);
    expect(kalakritiAttendee.phone.notNull).toBe(true);
    expect(kalakritiAttendee.email.notNull).toBe(false);
    expect(attendee.columns.some((column) => column.name === "user_id")).toBe(
      false
    );
  });
  it("enforces unique judge/competition links with two Edition-composite references", () => {
    const assignment = getTableConfig(kalakritiJudgeAssignment);
    const unique = assignment.indexes.find(
      (index) => index.config.name === "kalakriti_judge_assignment_scope_uidx"
    );
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns).toHaveLength(3);
    for (const name of [
      "kalakriti_judge_assignment_attendee_fk",
      "kalakriti_judge_assignment_competition_fk",
    ]) {
      const reference = assignment.foreignKeys
        .find((key) => key.getName() === name)
        ?.reference();
      expect(reference?.columns.map((column) => column.name)[0]).toBe(
        "edition_id"
      );
      expect(reference?.foreignColumns.map((column) => column.name)[0]).toBe(
        "edition_id"
      );
      expect(reference?.columns).toHaveLength(2);
    }
  });
});

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
    expect(sql).toBe(
      'num_nonnulls("kalakriti_operation"."student_id", "kalakriti_operation"."membership_id", "kalakriti_operation"."attendee_id") = 1'
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
      "kalakriti_operation_edition_attendee_fk",
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
