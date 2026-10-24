import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import type { AsyncTask } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { teamEventMutators } from "../team-event";

type Row = Record<string, unknown>;

function makeTx(seed: Partial<Record<string, Row[]>>) {
  const tables: Record<string, Row[]> = {
    teamEvent: [],
    teamEventMember: [],
    teamMember: [],
    ...seed,
  };
  const deletedIds: string[] = [];
  return {
    deletedIds,
    tx: {
      location: "server",
      mutate: {
        teamEventMember: {
          delete: mock(async ({ id }: { id: string }) => {
            deletedIds.push(id);
          }),
        },
      },
      run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
        const result = (tables[query.ast.table] ?? []).filter((row) =>
          matchesScope(
            row as ScopeRow,
            query.ast.where,
            tables as unknown as ScopeTables
          )
        );
        return query.format.singular ? result[0] : result;
      },
    },
  };
}

function leadContext() {
  const asyncTasks: AsyncTask[] = [];
  return {
    asyncTasks,
    ctx: {
      asyncTasks,
      permissions: [],
      role: "volunteer",
      traceId: "trace-1",
      userId: "lead-a",
    },
  };
}

const event = {
  id: "event-a",
  managementDomain: null,
  name: "Event A",
  teamId: "team-a",
  whatsappGroupId: "group-a",
};
const lead = {
  id: "lead-membership-a",
  role: "lead",
  teamId: "team-a",
  userId: "lead-a",
};

beforeEach(() => {
  enqueue.mockReset();
});

describe("teamEvent.removeMember", () => {
  it("does not let a lead combine their event ID with another event's member ID", async () => {
    const { deletedIds, tx } = makeTx({
      teamEvent: [event],
      teamEventMember: [
        { eventId: "event-b", id: "member-b", userId: "user-b" },
      ],
      teamMember: [lead],
    });
    const { asyncTasks, ctx } = leadContext();

    await expect(
      teamEventMutators.removeMember.fn({
        args: { eventId: "event-a", memberId: "member-b" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Member not found in this event");

    expect(deletedIds).toEqual([]);
    expect(asyncTasks).toEqual([]);
  });

  it("still removes a member of the managed event and uses that event for jobs", async () => {
    const { deletedIds, tx } = makeTx({
      teamEvent: [event],
      teamEventMember: [
        { eventId: "event-a", id: "member-a", userId: "user-a" },
      ],
      teamMember: [lead],
    });
    const { asyncTasks, ctx } = leadContext();

    await teamEventMutators.removeMember.fn({
      args: { eventId: "event-a", memberId: "member-a" },
      ctx,
      tx,
    } as never);

    expect(deletedIds).toEqual(["member-a"]);
    expect(asyncTasks).toHaveLength(2);
    await Promise.all(asyncTasks.map((task) => task.fn()));
    expect(enqueue.mock.calls).toEqual([
      [
        "whatsapp-remove-member",
        { groupId: "group-a", userId: "user-a" },
        { traceId: "trace-1" },
      ],
      [
        "notify-removed-from-event",
        {
          eventId: "event-a",
          eventName: "Event A",
          memberId: "member-a",
          teamId: "team-a",
          userId: "user-a",
        },
        { traceId: "trace-1" },
      ],
    ]);
  });

  it("accepts an equivalent UUID spelling and uses the canonical event ID", async () => {
    const canonicalEventId = "019a1b2c-3d4e-7f80-9abc-def012345678";
    const canonicalEvent = { ...event, id: canonicalEventId };
    const deletedIds: string[] = [];
    const tx = {
      location: "server",
      mutate: {
        teamEventMember: {
          delete: mock(async ({ id }: { id: string }) => {
            deletedIds.push(id);
          }),
        },
      },
      // PostgreSQL accepts the uppercase UUID in the predicate and returns
      // the stored UUID in canonical lowercase form.
      run: async (query: { ast: ScopeAst }) => {
        if (query.ast.table === "teamEvent") return canonicalEvent;
        if (query.ast.table === "teamMember") return lead;
        if (query.ast.table === "teamEventMember") {
          return {
            eventId: canonicalEventId,
            id: "member-a",
            userId: "user-a",
          };
        }
      },
    };
    const { asyncTasks, ctx } = leadContext();

    await teamEventMutators.removeMember.fn({
      args: {
        eventId: canonicalEventId.toUpperCase(),
        memberId: "member-a",
      },
      ctx,
      tx,
    } as never);

    expect(deletedIds).toEqual(["member-a"]);
    await Promise.all(asyncTasks.map((task) => task.fn()));
    expect(enqueue.mock.calls[1]?.[1]).toMatchObject({
      eventId: canonicalEventId,
    });
  });
});
