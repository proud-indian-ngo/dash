import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { KalakritiAwardsRoster } from "@pi-dash/shared/kalakriti-awards";

let access: unknown;
let lifecycle = "live";
let rows: unknown[] = [];
let selections: Record<string, unknown>[] = [];
const transaction = mock(async (run: (tx: unknown) => Promise<unknown>) =>
  run({
    select: (columns: Record<string, unknown>) => {
      selections.push(columns);
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () =>
          "lifecycle" in columns ? Promise.resolve([{ lifecycle }]) : chain,
        orderBy: () => Promise.resolve(rows),
      };
      return chain;
    },
  })
);
mock.module("@pi-dash/db", () => ({ db: { transaction } }));
mock.module("@/lib/server/kalakriti-edition-access", () => ({
  resolveKalakritiEditionAccess: () => Promise.resolve(access),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ set: mock(), error: mock(), emit: mock() }),
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));

const { getKalakritiAwards } = await import("./kalakriti-awards");
const run = (session: unknown = { user: { id: "actor", role: "volunteer" } }) =>
  (
    getKalakritiAwards as unknown as (
      input: unknown
    ) => Promise<KalakritiAwardsRoster>
  )({
    context: { session },
    data: { year: 2026 },
  });
const scoped = (responsibility: string) => ({
  isGlobalAdmin: false,
  edition: { id: "edition", lifecycle },
  membership: { kind: "volunteer", assignments: [{ responsibility }] },
});

beforeEach(() => {
  lifecycle = "live";
  access = scoped("awards_member");
  rows = [];
  selections = [];
  transaction.mockClear();
});

describe("Awards roster", () => {
  it("rejects anonymous and out-of-scope actors before reading recipients", async () => {
    await expect(run(null)).rejects.toThrow("Unauthorized");
    for (const denied of [
      null,
      scoped("competition_coordinator"),
      scoped("food_member"),
      {
        ...scoped("awards_lead"),
        membership: { kind: "guardian", assignments: [] },
      },
    ]) {
      access = denied;
      await expect(run()).rejects.toThrow("Unauthorized");
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(["awards_lead", "awards_member", "edition_admin"])(
    "allows %s during Live",
    async (role) => {
      access = scoped(role);
      expect(await run()).toEqual({
        editionId: "edition",
        canWrite: true,
        entries: [],
      });
    }
  );

  it("uses the current lifecycle and restricts archives to global administrators", async () => {
    lifecycle = "registration_locked";
    expect((await run()).canWrite).toBe(false);
    lifecycle = "archived";
    await expect(run()).rejects.toThrow("Unauthorized");
    access = { ...scoped(""), isGlobalAdmin: true, membership: null };
    expect((await run()).canWrite).toBe(false);
  });

  it("groups recipients without merging multiple awards for the same student or exposing result details", async () => {
    const common = {
      divisionId: "division",
      winnerEntryId: "group",
      entryId: "group",
      type: "group",
      competitionName: "Dance",
      ageCategoryName: "Junior",
      centerId: "center",
      centerName: "Center",
      studentId: "student",
      name: "Student",
      humanId: "K2026-001",
      gender: "female",
      awarded: true,
      version: 2,
      scorecardIds: ["private"],
      revisions: ["private"],
    };
    rows = [
      common,
      { ...common, studentId: "second", awarded: null, version: null },
      {
        ...common,
        divisionId: "another-division",
        entryId: "solo",
        winnerEntryId: "other",
        type: "individual",
        awarded: false,
        version: 4,
      },
    ];
    const result = await run();
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.members).toHaveLength(2);
    expect(result.entries[0]?.members[1]).toMatchObject({
      awarded: false,
      version: 0,
    });
    expect(result.entries[1]).toMatchObject({
      award: "runner_up",
      type: "individual",
    });
    expect(result.entries[1]?.members[0]).toMatchObject({
      studentId: "student",
      version: 4,
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(selections[1]).not.toHaveProperty("scorecardIds");
    expect(transaction.mock.calls[0]).toHaveLength(2);
  });
});
