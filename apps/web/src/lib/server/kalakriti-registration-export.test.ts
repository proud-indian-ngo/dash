import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const makeQuery = () => {
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      orderBy: vi.fn(),
      // biome-ignore lint/suspicious/noThenProperty: Drizzle builders are promise-like.
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockReturnValue(query);
    return query;
  };
  const tx = { select: vi.fn(makeQuery) };
  return {
    transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
});

vi.mock("@pi-dash/db", () => ({
  db: { transaction: dbMocks.transaction },
}));

import {
  assembleKalakritiRegistrationExportEntries,
  buildKalakritiRegistrationExportEntryCondition,
  buildKalakritiRegistrationExportScopeCondition,
  buildKalakritiRegistrationExportStudentCondition,
  getKalakritiRegistrationExport,
} from "@/lib/server/kalakriti-registration-export";

const dialect = new PgDialect();

describe("assembleKalakritiRegistrationExportEntries", () => {
  it("binds only server-derived Center, Category, and Competition IDs", () => {
    const condition = buildKalakritiRegistrationExportScopeCondition([
      { centerIds: ["center-1"], kind: "center" },
      {
        competitionCategoryIds: ["category-1"],
        kind: "competition_category",
      },
      { competitionIds: ["competition-1"], kind: "competition" },
    ]);

    expect(dialect.sqlToQuery(condition).params).toEqual(
      expect.arrayContaining(["center-1", "category-1", "competition-1"])
    );
  });

  it("binds Edition isolation and the same scoped actor inputs to both exports", () => {
    const scopes = [
      { centerIds: ["center-1"], kind: "center" as const },
      { competitionIds: ["competition-1"], kind: "competition" as const },
    ];
    const entryParams = dialect.sqlToQuery(
      buildKalakritiRegistrationExportEntryCondition("edition-1", scopes)
    ).params;
    const studentParams = dialect.sqlToQuery(
      buildKalakritiRegistrationExportStudentCondition({
        editionId: "edition-1",
        participantStudentIds: ["student-1"],
        scopes,
      })
    ).params;

    expect(entryParams).toEqual(
      expect.arrayContaining(["edition-1", "center-1", "competition-1"])
    );
    expect(studentParams).toEqual(
      expect.arrayContaining(["edition-1", "center-1", "student-1"])
    );
    expect(studentParams).not.toContain("competition-1");
  });

  it("reads Student and Entry rows from one repeatable, read-only snapshot", async () => {
    await getKalakritiRegistrationExport({
      editionId: "edition-1",
      scopes: [{ kind: "edition" }],
    });

    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
  });

  it("returns one row per Entry with ordered participant values", () => {
    const common = {
      ageCategory: "Junior",
      center: "Jayanagar",
      competition: "Group dance",
      competitionCategory: "Dance",
      endAt: new Date("2027-11-21T05:00:00.000Z"),
      entryId: "entry-1",
      participationMode: "group",
      startAt: new Date("2027-11-21T04:00:00.000Z"),
      venue: "Hall A",
    };

    expect(
      assembleKalakritiRegistrationExportEntries([
        {
          ...common,
          participantId: "K27-001",
          participantName: "Asha",
          studentId: "student-1",
        },
        {
          ...common,
          participantId: "K27-002",
          participantName: "Bina",
          studentId: "student-2",
        },
      ])
    ).toEqual([
      {
        ageCategory: "Junior",
        center: "Jayanagar",
        competition: "Group dance",
        competitionCategory: "Dance",
        endAt: "2027-11-21T05:00:00.000Z",
        entryId: "entry-1",
        participantIds: ["K27-001", "K27-002"],
        participantNames: ["Asha", "Bina"],
        participationMode: "group",
        startAt: "2027-11-21T04:00:00.000Z",
        venue: "Hall A",
      },
    ]);
  });

  it("keeps an Entry that has no participant row", () => {
    expect(
      assembleKalakritiRegistrationExportEntries([
        {
          ageCategory: "Junior",
          center: "Jayanagar",
          competition: "Drawing",
          competitionCategory: "Art",
          endAt: new Date("2027-11-21T05:00:00.000Z"),
          entryId: "entry-2",
          participantId: null,
          participantName: null,
          participationMode: "individual",
          startAt: new Date("2027-11-21T04:00:00.000Z"),
          studentId: null,
          venue: "Hall B",
        },
      ])
    ).toEqual([
      expect.objectContaining({
        entryId: "entry-2",
        participantIds: [],
        participantNames: [],
      }),
    ]);
  });
});
