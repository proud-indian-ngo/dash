import { kalakritiCenter } from "@pi-dash/db/schema/kalakriti";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const makeQuery = () => {
    const query = {
      from: vi.fn(),
      groupBy: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      orderBy: vi.fn(),
      // biome-ignore lint/suspicious/noThenProperty: Drizzle builders are promise-like.
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.groupBy.mockReturnValue(query);
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
    tx,
  };
});

vi.mock("@pi-dash/db", () => ({
  db: { transaction: dbMocks.transaction },
}));

import {
  assembleKalakritiRegistrationDashboardProjection,
  buildKalakritiRegistrationDashboardCategoryCondition,
  buildKalakritiRegistrationDashboardCenterCondition,
  buildKalakritiRegistrationDashboardCompetitionCondition,
  getKalakritiRegistrationDashboardProjections,
} from "./kalakriti-registration-dashboard";

const dialect = new PgDialect();

const rows = {
  ages: [
    {
      femaleStudentLimit: 3,
      id: "age-1",
      maleStudentLimit: 2,
      name: "Junior",
      sortOrder: 1,
    },
    {
      femaleStudentLimit: 5,
      id: "age-2",
      maleStudentLimit: 5,
      name: "Senior",
      sortOrder: 2,
    },
  ],
  categories: [
    { id: "category-1", name: "Art", sortOrder: 1 },
    { id: "category-2", name: "Stage", sortOrder: 2 },
  ],
  centers: [
    { id: "center-1", name: "Center One" },
    { id: "center-2", name: "Center Two" },
  ],
  competitions: [
    {
      cancelled: false,
      categoryId: "category-1",
      categoryRetired: false,
      id: "competition-1",
      name: "Drawing",
      retired: false,
    },
    {
      cancelled: false,
      categoryId: "category-2",
      categoryRetired: false,
      id: "competition-2",
      name: "Dance",
      retired: false,
    },
  ],
  entries: [
    {
      centerId: "center-1",
      entries: 2,
      participants: 2,
      sessionId: "session-1",
    },
    {
      centerId: "center-2",
      entries: 1,
      participants: 4,
      sessionId: "session-2",
    },
  ],
  participants: [],
  sessions: [
    {
      ageCategoryId: "age-1",
      cancelled: false,
      competitionId: "competition-1",
      id: "session-1",
      venueRetired: false,
    },
    {
      ageCategoryId: "age-2",
      cancelled: true,
      competitionId: "competition-2",
      id: "session-2",
      venueRetired: false,
    },
  ],
  students: [
    {
      ageCategoryId: "age-1",
      centerId: "center-1",
      femaleStudents: 2,
      maleStudents: 1,
      registeredStudents: 2,
      students: 3,
    },
    {
      ageCategoryId: "age-2",
      centerId: "center-2",
      femaleStudents: 3,
      maleStudents: 1,
      registeredStudents: 4,
      students: 4,
    },
  ],
};

describe("Kalakriti registration dashboard aggregation", () => {
  it("reads every projection from one repeatable, read-only snapshot", async () => {
    await getKalakritiRegistrationDashboardProjections({
      editionId: "edition-1",
      scopes: [
        { kind: "edition" },
        { competitionIds: ["competition-1"], kind: "competition" },
      ],
    });

    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
  });

  it("binds Center, Category, and Competition IDs into SQL scope conditions", () => {
    const center = dialect.sqlToQuery(
      buildKalakritiRegistrationDashboardCenterCondition(
        { centerIds: ["center-1"], kind: "center" },
        kalakritiCenter.id
      )
    );
    expect(center.params).toContain("center-1");

    const competition = dialect.sqlToQuery(
      buildKalakritiRegistrationDashboardCompetitionCondition({
        competitionIds: ["competition-1"],
        kind: "competition",
      })
    );
    expect(competition.params).toContain("competition-1");

    const proxy = drizzle(() => Promise.resolve({ rows: [] }));
    const category = dialect.sqlToQuery(
      buildKalakritiRegistrationDashboardCategoryCondition(
        proxy as never,
        "edition-1",
        {
          competitionIds: ["competition-1"],
          kind: "competition",
        }
      )
    );
    expect(category.params).toEqual(
      expect.arrayContaining(["edition-1", "competition-1"])
    );
  });

  it("assembles authoritative Edition totals without double-counting groups", () => {
    const projection = assembleKalakritiRegistrationDashboardProjection(
      { kind: "edition" },
      rows
    );

    expect(projection.totals).toEqual({
      entries: 3,
      participants: 6,
      registeredStudents: 6,
      studentLimit: 30,
      students: 7,
    });
    expect(projection.centers).toHaveLength(2);
    expect(projection.competitionCategories).toEqual([
      expect.objectContaining({ entries: 2, id: "category-1" }),
      expect.objectContaining({ entries: 1, id: "category-2" }),
    ]);
  });

  it("applies shared Student limits to a Center projection", () => {
    const centerRows = {
      ...rows,
      categories: rows.categories.slice(0, 1),
      centers: rows.centers.slice(0, 1),
      competitions: rows.competitions.slice(0, 1),
      entries: rows.entries.slice(0, 1),
      sessions: rows.sessions.slice(0, 1),
      students: rows.students.slice(0, 1),
    };
    const projection = assembleKalakritiRegistrationDashboardProjection(
      { centerIds: ["center-1"], kind: "center" },
      centerRows
    );

    expect(projection.centers).toEqual([
      expect.objectContaining({
        id: "center-1",
        studentLimit: 15,
        students: 3,
      }),
    ]);
    expect(JSON.stringify(projection)).not.toContain("Center Two");
  });

  it("uses distinct scoped participants as Category student totals", () => {
    const projection = assembleKalakritiRegistrationDashboardProjection(
      {
        competitionCategoryIds: ["category-1"],
        kind: "competition_category",
      },
      {
        ...rows,
        categories: rows.categories.slice(0, 1),
        centers: [],
        competitions: rows.competitions.slice(0, 1),
        entries: rows.entries.slice(0, 1),
        participants: [{ ageCategoryId: "age-1", registeredStudents: 2 }],
        sessions: rows.sessions.slice(0, 1),
        students: [],
      }
    );

    expect(projection.centers).toEqual([]);
    expect(projection.ageCategories).toEqual([
      expect.objectContaining({
        femaleStudentLimit: null,
        femaleStudents: null,
        id: "age-1",
        maleStudentLimit: null,
        maleStudents: null,
        registeredStudents: 2,
        students: 2,
      }),
    ]);
    expect(projection.totals.students).toBe(2);
  });

  it("returns an empty bounded projection for an empty Edition", () => {
    const projection = assembleKalakritiRegistrationDashboardProjection(
      { kind: "edition" },
      {
        ages: [],
        categories: [],
        centers: [],
        competitions: [],
        entries: [],
        participants: [],
        sessions: [],
        students: [],
      }
    );

    expect(projection).toEqual(
      expect.objectContaining({
        ageCategories: [],
        centers: [],
        competitionCategories: [],
        competitions: [],
        totals: {
          entries: 0,
          participants: 0,
          registeredStudents: 0,
          studentLimit: 0,
          students: 0,
        },
      })
    );
  });
});
