import { describe, expect, it, mock } from "bun:test";

import type { AsyncTask } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { teamMutators } from "../team";

type Row = Record<string, string | boolean | null>;

function makeTx(tables: Partial<Record<string, Row[]>>) {
  const all: Record<string, Row[]> = {
    team: [],
    teamMember: [],
    ...tables,
  };
  const deletedIds: string[] = [];
  const insertedTeamIds: string[] = [];
  const updates: Row[] = [];
  return {
    deletedIds,
    insertedTeamIds,
    tx: {
      // The creation lock assertNewRecord takes on the server.
      dbTransaction: { wrappedTransaction: { execute: async () => [] } },
      location: "server",
      mutate: {
        // Zero's server insert is ON CONFLICT (id) DO NOTHING.
        team: {
          insert: mock(async (row: Row) => {
            all.team ??= [];
            if (!all.team.some((existing) => existing.id === row.id)) {
              all.team.push(row);
              insertedTeamIds.push(row.id as string);
            }
          }),
        },
        teamMember: {
          delete: mock(async ({ id }: { id: string }) => {
            deletedIds.push(id);
          }),
          update: mock(async (row: Row) => {
            updates.push(row);
          }),
        },
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
    },
    updates,
  };
}

function context(userId: string, permissions: string[] = []) {
  const asyncTasks: AsyncTask[] = [];
  return {
    asyncTasks,
    ctx: {
      asyncTasks,
      permissions,
      role: permissions.length > 0 ? "admin" : "volunteer",
      userId,
    },
  };
}

describe("team.create", () => {
  const existingId = "01930000-0000-7000-8000-000000000001";
  const newId = "01930000-0000-7000-8000-000000000002";

  it("refuses an existing team id instead of queueing a group for that team", async () => {
    const { insertedTeamIds, tx } = makeTx({
      team: [{ id: existingId, name: "Team A" }],
    });
    const { asyncTasks, ctx } = context("user-x", ["teams.create"]);

    await expect(
      teamMutators.create.fn({
        args: { createWhatsAppGroup: true, id: existingId, name: "Team X" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Record already exists");

    expect(insertedTeamIds).toEqual([]);
    expect(asyncTasks).toEqual([]);
  });

  it("creates a new team and queues its group", async () => {
    const { insertedTeamIds, tx } = makeTx({
      team: [{ id: existingId, name: "Team A" }],
    });
    const { asyncTasks, ctx } = context("user-x", ["teams.create"]);

    await teamMutators.create.fn({
      args: { createWhatsAppGroup: true, id: newId, name: "Team X" },
      ctx,
      tx,
    } as never);

    expect(insertedTeamIds).toEqual([newId]);
    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0]?.meta).toMatchObject({
      mutator: "createTeam",
      teamId: newId,
    });
  });
});

describe("team.removeMember", () => {
  const teams = [
    { id: "team-a", name: "Team A" },
    { id: "team-b", name: "Team B" },
  ];

  it("does not let a lead combine their team ID with another team's member ID", async () => {
    const { deletedIds, tx } = makeTx({
      team: teams,
      teamMember: [
        {
          id: "lead-a",
          role: "lead",
          teamId: "team-a",
          userId: "user-a",
        },
        {
          id: "member-b",
          role: "member",
          teamId: "team-b",
          userId: "user-b",
        },
      ],
    });
    const { asyncTasks, ctx } = context("user-a");

    await expect(
      teamMutators.removeMember.fn({
        args: { memberId: "member-b", teamId: "team-a" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Member not found");

    expect(deletedIds).toEqual([]);
    expect(asyncTasks).toEqual([]);
  });

  it("lets a lead remove a regular member from the same team", async () => {
    const { deletedIds, tx } = makeTx({
      team: teams,
      teamMember: [
        {
          id: "lead-a",
          role: "lead",
          teamId: "team-a",
          userId: "user-a",
        },
        {
          id: "member-a",
          role: "member",
          teamId: "team-a",
          userId: "user-b",
        },
      ],
    });
    const { asyncTasks, ctx } = context("user-a");

    await teamMutators.removeMember.fn({
      args: { memberId: "member-a", teamId: "team-a" },
      ctx,
      tx,
    } as never);

    expect(deletedIds).toEqual(["member-a"]);
    expect(asyncTasks).toHaveLength(2);
    expect(asyncTasks[0]?.meta).toMatchObject({
      memberUserId: "user-b",
      teamId: "team-a",
    });
  });

  it("keeps global managers able to remove a lead when the team matches", async () => {
    const { deletedIds, tx } = makeTx({
      team: teams,
      teamMember: [
        {
          id: "lead-b",
          role: "lead",
          teamId: "team-b",
          userId: "user-b",
        },
      ],
    });
    const { asyncTasks, ctx } = context("admin", ["teams.manage_members"]);

    await expect(
      teamMutators.removeMember.fn({
        args: { memberId: "lead-b", teamId: "team-a" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Member not found");
    expect(deletedIds).toEqual([]);
    expect(asyncTasks).toEqual([]);

    await teamMutators.removeMember.fn({
      args: { memberId: "lead-b", teamId: "team-b" },
      ctx,
      tx,
    } as never);

    expect(deletedIds).toEqual(["lead-b"]);
  });

  it("still prevents a scoped lead from removing another lead", async () => {
    const { deletedIds, tx } = makeTx({
      team: teams,
      teamMember: [
        {
          id: "lead-a-1",
          role: "lead",
          teamId: "team-a",
          userId: "user-a",
        },
        {
          id: "lead-a-2",
          role: "lead",
          teamId: "team-a",
          userId: "user-b",
        },
      ],
    });
    const { asyncTasks, ctx } = context("user-a");

    await expect(
      teamMutators.removeMember.fn({
        args: { memberId: "lead-a-2", teamId: "team-a" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Team leads cannot remove other leads");

    expect(deletedIds).toEqual([]);
    expect(asyncTasks).toEqual([]);
  });
});

describe("team.setMemberRole", () => {
  const teams = [{ id: "team-a", name: "Team A" }];
  const twoLeads = [
    {
      id: "lead-a-1",
      role: "lead",
      teamId: "team-a",
      userId: "user-a",
    },
    {
      id: "lead-a-2",
      role: "lead",
      teamId: "team-a",
      userId: "user-b",
    },
  ];

  it("prevents a scoped lead from demoting another lead", async () => {
    const { tx, updates } = makeTx({ team: teams, teamMember: twoLeads });
    const { asyncTasks, ctx } = context("user-a");

    await expect(
      teamMutators.setMemberRole.fn({
        args: { memberId: "lead-a-2", role: "member" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Team leads cannot demote other leads");

    expect(updates).toEqual([]);
    expect(asyncTasks).toEqual([]);
  });

  it("lets a lead demote themselves", async () => {
    const { tx, updates } = makeTx({ team: teams, teamMember: twoLeads });
    const { ctx } = context("user-a");

    await teamMutators.setMemberRole.fn({
      args: { memberId: "lead-a-1", role: "member" },
      ctx,
      tx,
    } as never);

    expect(updates).toEqual([{ id: "lead-a-1", role: "member" }]);
  });

  it("lets global managers demote a lead", async () => {
    const { tx, updates } = makeTx({ team: teams, teamMember: twoLeads });
    const { ctx } = context("admin", ["teams.manage_members"]);

    await teamMutators.setMemberRole.fn({
      args: { memberId: "lead-a-2", role: "member" },
      ctx,
      tx,
    } as never);

    expect(updates).toEqual([{ id: "lead-a-2", role: "member" }]);
  });
});
