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
  return {
    deletedIds,
    tx: {
      location: "server",
      mutate: {
        teamMember: {
          delete: mock(async ({ id }: { id: string }) => {
            deletedIds.push(id);
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
