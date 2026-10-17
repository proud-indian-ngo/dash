import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueueMock = mock(async () => "job-1");
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: enqueueMock }));

import type { AsyncTask } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { teamMutators } from "../team";
import { teamEventMutators } from "../team-event";
import { whatsappGroupChange } from "../whatsapp-group-link";

type Row = Record<string, unknown>;

function fakeTx(
  tables: Partial<Record<string, Row[]>>,
  location: "client" | "server" = "server"
) {
  const all: Record<string, Row[]> = {
    appConfig: [],
    team: [],
    teamEvent: [],
    teamEventMember: [],
    teamMember: [],
    ...tables,
  };
  const writes: { table: string; op: string; value: Row }[] = [];
  const table = (name: string) => ({
    delete: mock(async (value: Row) => {
      writes.push({ op: "delete", table: name, value });
    }),
    insert: mock(async (value: Row) => {
      writes.push({ op: "insert", table: name, value });
    }),
    update: mock(async (value: Row) => {
      writes.push({ op: "update", table: name, value });
    }),
  });
  const tx = {
    location,
    mutate: {
      eventPartner: table("eventPartner"),
      team: table("team"),
      teamEvent: table("teamEvent"),
      teamEventMember: table("teamEventMember"),
    },
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
      const result = (all[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          all as unknown as ScopeTables
        )
      );
      return query.format.singular ? result[0] : result;
    },
  };
  return { tx, writes };
}

function adminCtx(permissions: string[]) {
  const asyncTasks: AsyncTask[] = [];
  return {
    asyncTasks,
    ctx: { asyncTasks, permissions, role: "admin", userId: "admin-1" },
  };
}

const addMembersTasks = (tasks: AsyncTask[]) =>
  tasks.filter((task) => task.meta.whatsappGroupId !== undefined);

const NOW = 1_800_000_000_000;

beforeEach(() => {
  enqueueMock.mockClear();
});

describe("whatsappGroupChange", () => {
  it("treats undefined as unchanged and null or empty as removal", () => {
    expect(whatsappGroupChange("g1", undefined)).toBeUndefined();
    expect(whatsappGroupChange("g1", "g1")).toBeUndefined();
    expect(whatsappGroupChange(null, null)).toBeUndefined();
    expect(whatsappGroupChange(null, "")).toBeUndefined();
    expect(whatsappGroupChange("g1", null)).toBeNull();
    expect(whatsappGroupChange("g1", "")).toBeNull();
    expect(whatsappGroupChange("g1", "g2")).toBe("g2");
    expect(whatsappGroupChange(null, "g2")).toBe("g2");
  });
});

describe("team.update WhatsApp group", () => {
  const team = { id: "t1", name: "Team", programmeId: null };
  const members = [
    { id: "m1", teamId: "t1", userId: "u1" },
    { id: "m2", teamId: "t1", userId: "u2" },
  ];

  async function runUpdate(
    tables: Partial<Record<string, Row[]>>,
    whatsappGroupId: string | null | undefined
  ) {
    const { tx, writes } = fakeTx(tables);
    const { asyncTasks, ctx } = adminCtx(["teams.edit"]);
    await teamMutators.update.fn({
      args: { id: "t1", name: "Team", now: NOW, whatsappGroupId },
      ctx,
      tx,
    } as unknown as Parameters<typeof teamMutators.update.fn>[0]);
    return { asyncTasks, writes };
  }

  it("clears the group on null without adding anyone", async () => {
    const { asyncTasks, writes } = await runUpdate(
      { team: [{ ...team, whatsappGroupId: "g1" }], teamMember: members },
      null
    );
    expect(writes[0]?.value).toMatchObject({ id: "t1", whatsappGroupId: null });
    expect(addMembersTasks(asyncTasks)).toHaveLength(0);
  });

  it("leaves the group alone on undefined", async () => {
    const { asyncTasks, writes } = await runUpdate(
      { team: [{ ...team, whatsappGroupId: "g1" }], teamMember: members },
      undefined
    );
    expect(writes[0]?.value).not.toHaveProperty("whatsappGroupId");
    expect(addMembersTasks(asyncTasks)).toHaveLength(0);
  });

  it("doesn't re-add members when the group is unchanged", async () => {
    const { asyncTasks } = await runUpdate(
      { team: [{ ...team, whatsappGroupId: "g1" }], teamMember: members },
      "g1"
    );
    expect(addMembersTasks(asyncTasks)).toHaveLength(0);
  });

  it("adds current members on link and on switch", async () => {
    for (const current of [null, "g1"]) {
      enqueueMock.mockClear();
      const { asyncTasks } = await runUpdate(
        { team: [{ ...team, whatsappGroupId: current }], teamMember: members },
        "g2"
      );
      const [task] = addMembersTasks(asyncTasks);
      expect(task?.meta).toMatchObject({
        entityId: "t1",
        entityType: "team",
        whatsappGroupId: "g2",
      });
      await task?.fn();
      expect(enqueueMock).toHaveBeenCalledWith(
        "whatsapp-add-members",
        { groupId: "g2", userIds: ["u1", "u2"] },
        expect.objectContaining({ singletonKey: "whatsapp-link-team-t1-g2" })
      );
    }
  });

  it("refuses a group another team or event uses, naming the owner", async () => {
    await expect(
      runUpdate(
        {
          team: [
            { ...team, whatsappGroupId: null },
            { id: "t2", name: "Other", whatsappGroupId: "g2" },
          ],
        },
        "g2"
      )
    ).rejects.toThrow("already linked to another team");
    await expect(
      runUpdate(
        {
          team: [{ ...team, whatsappGroupId: null }],
          teamEvent: [{ id: "e9", seriesId: null, whatsappGroupId: "g2" }],
        },
        "g2"
      )
    ).rejects.toThrow("already linked to another event");
  });

  it("refuses the app-wide groups", async () => {
    await expect(
      runUpdate(
        {
          appConfig: [{ key: "all_volunteers_group_id", value: "g2" }],
          team: [{ ...team, whatsappGroupId: null }],
        },
        "g2"
      )
    ).rejects.toThrow("all-volunteers group");
  });

  it("keeps an existing shared link working when the group doesn't change", async () => {
    const { writes } = await runUpdate(
      {
        team: [
          { ...team, whatsappGroupId: "g1" },
          { id: "t2", name: "Other", whatsappGroupId: "g1" },
        ],
      },
      "g1"
    );
    expect(writes).toHaveLength(1);
  });

  it("skips the owner check on the client", async () => {
    const { tx } = fakeTx(
      {
        team: [
          { ...team, whatsappGroupId: null },
          { id: "t2", name: "Other", whatsappGroupId: "g2" },
        ],
      },
      "client"
    );
    const { ctx } = adminCtx(["teams.edit"]);
    await teamMutators.update.fn({
      args: { id: "t1", name: "Team", now: NOW, whatsappGroupId: "g2" },
      ctx,
      tx,
    } as unknown as Parameters<typeof teamMutators.update.fn>[0]);
  });
});

describe("teamEvent WhatsApp group", () => {
  const event = {
    endTime: null,
    id: "e1",
    managementDomain: null,
    name: "Event",
    programmeId: "p1",
    recurrenceRule: null,
    seriesId: null,
    startTime: NOW + 1000,
    teamId: "t1",
  };
  const eventMembers = [{ eventId: "e1", id: "em1", userId: "u1" }];

  async function runUpdate(
    tables: Partial<Record<string, Row[]>>,
    whatsappGroupId: string | null | undefined
  ) {
    const { tx, writes } = fakeTx(tables);
    const { asyncTasks, ctx } = adminCtx(["events.edit"]);
    await teamEventMutators.update.fn({
      args: { id: "e1", now: NOW, whatsappGroupId },
      ctx,
      tx,
    } as unknown as Parameters<typeof teamEventMutators.update.fn>[0]);
    return { asyncTasks, writes };
  }

  it("clears the group on null", async () => {
    const { asyncTasks, writes } = await runUpdate(
      {
        teamEvent: [{ ...event, whatsappGroupId: "g1" }],
        teamEventMember: eventMembers,
      },
      null
    );
    expect(writes[0]?.value).toMatchObject({ id: "e1", whatsappGroupId: null });
    expect(addMembersTasks(asyncTasks)).toHaveLength(0);
  });

  it("adds event members on switch, not when unchanged", async () => {
    const tables = {
      teamEvent: [{ ...event, whatsappGroupId: "g1" }],
      teamEventMember: eventMembers,
    };
    const unchanged = await runUpdate(tables, "g1");
    expect(addMembersTasks(unchanged.asyncTasks)).toHaveLength(0);

    const switched = await runUpdate(tables, "g2");
    const [task] = addMembersTasks(switched.asyncTasks);
    await task?.fn();
    expect(enqueueMock).toHaveBeenCalledWith(
      "whatsapp-add-members",
      { groupId: "g2", userIds: ["u1"] },
      expect.objectContaining({ singletonKey: "whatsapp-link-event-e1-g2" })
    );
  });

  it("refuses a group another event uses but allows its own series", async () => {
    await expect(
      runUpdate(
        {
          teamEvent: [
            { ...event, whatsappGroupId: null },
            { ...event, id: "e2", whatsappGroupId: "g2" },
          ],
        },
        "g2"
      )
    ).rejects.toThrow("already linked to another event");

    // e1 is an exception of series s1, which already uses g2.
    const { writes } = await runUpdate(
      {
        teamEvent: [
          { ...event, id: "s1", whatsappGroupId: "g2" },
          { ...event, seriesId: "s1", whatsappGroupId: "g1" },
        ],
      },
      "g2"
    );
    expect(writes[0]?.value).toMatchObject({ whatsappGroupId: "g2" });
  });

  it("refuses a group a team uses on create", async () => {
    const { tx } = fakeTx({
      team: [{ id: "t2", whatsappGroupId: "g2" }],
    });
    const { ctx } = adminCtx(["events.create"]);
    await expect(
      teamEventMutators.create.fn({
        args: {
          id: "e3",
          name: "New",
          now: NOW,
          programmeId: undefined,
          startTime: NOW + 1000,
          teamId: "t1",
          whatsappGroupId: "g2",
        },
        ctx,
        tx,
      } as unknown as Parameters<typeof teamEventMutators.create.fn>[0])
    ).rejects.toThrow("already linked to another team");
  });

  it("clears an occurrence's group on null without inheriting the series'", async () => {
    const series = {
      ...event,
      id: "s1",
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
      whatsappGroupId: "g1",
    };
    const { tx, writes } = fakeTx({ teamEvent: [series] });
    const { ctx } = adminCtx(["events.edit"]);
    await teamEventMutators.updateSeries.fn({
      args: {
        id: "s1",
        mode: "this",
        newExceptionId: "x1",
        now: NOW,
        originalDate: "2027-01-02",
        whatsappGroupId: null,
      },
      ctx,
      tx,
    } as unknown as Parameters<typeof teamEventMutators.updateSeries.fn>[0]);
    const insert = writes.find((w) => w.op === "insert");
    expect(insert?.value).toMatchObject({ id: "x1", whatsappGroupId: null });
  });

  it("adds series members when the whole series switches group", async () => {
    const series = {
      ...event,
      id: "s1",
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
      whatsappGroupId: "g1",
    };
    const { tx } = fakeTx({
      teamEvent: [series],
      teamEventMember: [{ eventId: "s1", id: "em1", userId: "u7" }],
    });
    const { asyncTasks, ctx } = adminCtx(["events.edit"]);
    await teamEventMutators.updateSeries.fn({
      args: { id: "s1", mode: "all", now: NOW, whatsappGroupId: "g2" },
      ctx,
      tx,
    } as unknown as Parameters<typeof teamEventMutators.updateSeries.fn>[0]);
    const [task] = addMembersTasks(asyncTasks);
    await task?.fn();
    expect(enqueueMock).toHaveBeenCalledWith(
      "whatsapp-add-members",
      { groupId: "g2", userIds: ["u7"] },
      expect.anything()
    );
  });
});
