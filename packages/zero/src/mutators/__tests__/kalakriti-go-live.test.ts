import { describe, expect, it } from "bun:test";

import {
  getKalakritiGoLiveReadiness,
  type KalakritiGoLiveReadinessSnapshot,
} from "../../kalakriti-go-live-readiness";
import { kalakritiEditionQueries } from "../../queries/kalakriti-edition";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { kalakritiEditionMutators } from "../kalakriti-edition";

type Row = Record<string, unknown>;
function fixture() {
  const rows: Record<string, Row[]> = {};
  function add(editionId: string) {
    const put = (table: string, data: Row[]) => {
      rows[table] ??= [];
      rows[table]!.push(...data.map((row) => ({ editionId, ...row })));
    };
    put("kalakritiEdition", [
      {
        id: editionId,
        lifecycle: "registration_locked",
        teamEventId: `${editionId}-event`,
        ageCutoffDate: Date.UTC(2028, 5, 1),
        eventDate: Date.UTC(2028, 10, 19),
        plannedRegistrationCloseAt: Date.UTC(2028, 9, 31),
        timezone: "Asia/Kolkata",
      },
    ]);
    put("kalakritiCenter", [
      {
        id: `${editionId}-center`,
        retiredAt: null,
        studentRegistrationEnabled: false,
        competitionEntryRegistrationEnabled: false,
      },
    ]);
    put("kalakritiAgeCategory", [
      {
        id: `${editionId}-age`,
        femaleStudentLimit: 20,
        maleStudentLimit: 20,
        minimumAge: 8,
        maximumAge: 12,
      },
    ]);
    put("kalakritiCompetitionCategory", [
      { id: `${editionId}-category`, retiredAt: null },
    ]);
    put("kalakritiCompetition", [
      {
        id: `${editionId}-competition`,
        competitionCategoryId: `${editionId}-category`,
        cancelledAt: null,
        retiredAt: null,
      },
    ]);
    put("kalakritiCompetitionDivision", [
      {
        id: `${editionId}-division`,
        competitionId: `${editionId}-competition`,
        ageCategoryId: `${editionId}-age`,
      },
    ]);
    put("kalakritiCompetitionSession", [
      {
        id: `${editionId}-session`,
        divisionId: `${editionId}-division`,
        venueId: `${editionId}-venue`,
        cancelledAt: null,
        startAt: new Date("2028-11-19T10:00:00+05:30").getTime(),
        endAt: new Date("2028-11-19T11:00:00+05:30").getTime(),
      },
    ]);
    put("kalakritiVenue", [{ id: `${editionId}-venue`, retiredAt: null }]);
    put("kalakritiEditionMembership", [
      {
        id: `${editionId}-holder`,
        userId: "holder",
        kind: "volunteer",
        state: "active",
      },
    ]);
    put(
      "kalakritiAssignment",
      ["overall_events_lead", "transport_lead", "food_lead"].map(
        (responsibility) => ({
          id: `${editionId}-${responsibility}`,
          membershipId: `${editionId}-holder`,
          responsibility,
        })
      )
    );
    put("kalakritiTransportAssignment", [
      {
        id: `${editionId}-vehicle`,
        centerId: `${editionId}-center`,
        deletedAt: null,
      },
    ]);
    put("teamEvent", [{ id: `${editionId}-event`, isPublic: false }]);
    put("kalakritiAuditEntry", []);
  }
  add("a");
  const mutations: Row[] = [];
  const tasks: unknown[] = [];
  const select = (query: { ast: ScopeAst; format?: { singular: boolean } }) => {
    const selected = (rows[query.ast.table] ?? []).filter((row) =>
      matchesScope(row as ScopeRow, query.ast.where, rows as ScopeTables)
    );
    return query.format?.singular ? selected[0] : selected;
  };
  let tail = Promise.resolve();
  async function execute(
    editionId = "a",
    permissions = ["kalakriti.admin"],
    location = "server"
  ) {
    let release: (() => void) | undefined;
    let globalLocked = false;
    const builder = {
      from: () => builder,
      where: () => builder,
      for: async () => {
        if (!globalLocked) throw new Error("Edition lock before global lock");
        return rows.kalakritiEdition!.filter((row) => row.id === editionId);
      },
    };
    const tx = {
      location,
      dbTransaction: {
        wrappedTransaction: {
          select: () => builder,
          execute: async () => {
            const previous = tail;
            tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            globalLocked = true;
          },
        },
      },
      run: async (query: Parameters<typeof select>[0]) => select(query),
      mutate: Object.fromEntries(
        Object.keys(rows).map((table) => [
          table,
          {
            update: async (data: Row) => {
              mutations.push({ table, ...data });
              Object.assign(
                rows[table]!.find((row) => row.id === data.id)!,
                data
              );
            },
            insert: async (data: Row) => {
              mutations.push({ table, ...data });
              rows[table]!.push(data);
            },
          },
        ])
      ),
    };
    try {
      await kalakritiEditionMutators.transition.fn({
        args: {
          editionId,
          targetLifecycle: "live",
          confirmed: true,
          auditEntryId: `${editionId}-audit`,
          now: 100,
        },
        ctx: { userId: "holder", permissions, asyncTasks: tasks },
        tx,
      } as never);
    } finally {
      release?.();
    }
  }
  const snapshot = (): KalakritiGoLiveReadinessSnapshot =>
    ({
      edition: rows.kalakritiEdition![0],
      centers: rows.kalakritiCenter,
      ageCategories: rows.kalakritiAgeCategory,
      competitionCategories: rows.kalakritiCompetitionCategory,
      competitions: rows.kalakritiCompetition,
      divisions: rows.kalakritiCompetitionDivision,
      sessions: rows.kalakritiCompetitionSession,
      venues: rows.kalakritiVenue,
      assignments: rows.kalakritiAssignment,
      transportAssignments: rows.kalakritiTransportAssignment,
    }) as unknown as KalakritiGoLiveReadinessSnapshot;
  return { rows, add, mutations, tasks, execute, snapshot, select };
}

describe("credential-free go-live", () => {
  it("requires no credentials, IDs, roster issuance or scans", async () => {
    const state = fixture();
    expect(getKalakritiGoLiveReadiness(state.snapshot())).toEqual([]);
    await state.execute();
    expect(state.rows.kalakritiEdition![0]!.lifecycle).toBe("live");
    expect(state.rows.kalakritiCenter![0]).toMatchObject({
      studentRegistrationEnabled: false,
      competitionEntryRegistrationEnabled: false,
    });
    expect(state.rows.teamEvent![0]!.isPublic).toBe(true);
    expect(state.rows.kalakritiAuditEntry![0]).toMatchObject({
      action: "lifecycle_transitioned",
      metadata: { from: "registration_locked", to: "live" },
    });
    expect(state.tasks).toEqual([]);
  });
  for (const [field, value] of [
    ["state", "archived"],
    ["kind", "guardian"],
    ["userId", null],
    ["editionId", "elsewhere"],
  ] as const) {
    it(`does not count a lead with membership ${field}=${value}`, async () => {
      const state = fixture();
      state.rows.kalakritiEditionMembership![0]![field] = value;
      await expect(state.execute()).rejects.toThrow("missing_food_lead");
      expect(state.mutations).toEqual([]);
      const query = kalakritiEditionQueries.readiness.fn({
        args: { editionId: "a" },
        ctx: { userId: "admin", permissions: ["kalakriti.admin"] },
      } as never) as unknown as { ast: ScopeAst };
      const assignments = query.ast.related?.find(
        (related) => related.subquery.alias === "assignments"
      )!.subquery;
      expect(state.select({ ast: assignments! })).toEqual([]);
    });
  }
  it("rejects deleted vehicle coverage on both preview and server", async () => {
    const state = fixture();
    state.rows.kalakritiTransportAssignment![0]!.deletedAt = 1;
    expect(
      getKalakritiGoLiveReadiness(state.snapshot()).map(
        (blocker) => blocker.code
      )
    ).toContain("missing_transport_assignment");
    await expect(state.execute()).rejects.toThrow(
      "missing_transport_assignment"
    );
    expect(state.mutations).toEqual([]);
  });
  for (const value of [true, null])
    it(`fails closed for Center controls ${value}`, async () => {
      const state = fixture();
      state.rows.kalakritiCenter![0]!.studentRegistrationEnabled = value;
      await expect(state.execute()).rejects.toThrow("center_registration_open");
      expect(state.mutations).toEqual([]);
    });
  it("retains registration configuration blockers", async () => {
    const state = fixture();
    state.rows.kalakritiCompetitionSession = [];
    await expect(state.execute()).rejects.toThrow(
      "competition_missing_session"
    );
    expect(state.mutations).toEqual([]);
  });
  for (const lifecycle of ["draft", "registration_open", "live", "archived"])
    it(`rejects ${lifecycle} as a fresh source`, async () => {
      const state = fixture();
      state.rows.kalakritiEdition![0]!.lifecycle = lifecycle;
      await expect(state.execute()).rejects.toThrow("lifecycle");
      expect(state.mutations).toEqual([]);
    });
  it("requires configuration administration", async () => {
    const state = fixture();
    await expect(state.execute("a", ["kalakriti.view"])).rejects.toThrow(
      "Unauthorized"
    );
    expect(state.mutations).toEqual([]);
  });
  it("serializes actual transition functions across different Editions", async () => {
    const state = fixture();
    state.add("b");
    const outcomes = await Promise.allSettled([
      state.execute("a"),
      state.execute("b"),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      state.rows.kalakritiEdition!.filter((row) => row.lifecycle === "live")
    ).toHaveLength(1);
    expect(state.rows.kalakritiAuditEntry).toHaveLength(1);
    expect(
      outcomes.find((outcome) => outcome.status === "rejected")
    ).toMatchObject({ reason: new Error("Another Edition is already live") });
  });
  it("does not optimistically open operational access", async () => {
    const state = fixture();
    await state.execute("a", ["kalakriti.admin"], "client");
    expect(state.mutations).toEqual([]);
  });
});
