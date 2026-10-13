import { describe, expect, it } from "bun:test";

import type { Context } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  assertCanChangeProgramme,
  assertRequestProgrammeSelectable,
  buildProgrammeChangeHistory,
} from "../submission-helpers";

type Row = Record<string, unknown>;

function fakeTx(programmes: Row[], location: "client" | "server" = "server") {
  const all: Record<string, Row[]> = { programme: programmes };
  return {
    location,
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
  } as never;
}

function ctx(permissions: string[]): Context {
  return { permissions, role: "volunteer", userId: "user-1" };
}

describe("assertRequestProgrammeSelectable", () => {
  it("accepts an active programme", async () => {
    const tx = fakeTx([{ active: true, id: "p1" }]);
    await expect(
      assertRequestProgrammeSelectable(tx, "p1")
    ).resolves.toBeUndefined();
  });

  it("rejects an inactive programme and, on the server, an unknown one", async () => {
    const tx = fakeTx([{ active: false, id: "p1" }]);
    await expect(assertRequestProgrammeSelectable(tx, "p1")).rejects.toThrow(
      "Choose an active programme"
    );
    await expect(
      assertRequestProgrammeSelectable(tx, "missing")
    ).rejects.toThrow("Programme not found");
  });

  it("keeps an unchanged programme after it is deactivated", async () => {
    const tx = fakeTx([{ active: false, id: "p1" }]);
    await expect(
      assertRequestProgrammeSelectable(tx, "p1", "p1")
    ).resolves.toBeUndefined();
  });

  it("tolerates a cache miss on the client", async () => {
    const tx = fakeTx([], "client");
    await expect(
      assertRequestProgrammeSelectable(tx, "not-synced-yet")
    ).resolves.toBeUndefined();
  });
});

describe("assertCanChangeProgramme", () => {
  it("lets anyone who may edit change the programme while pending", () => {
    expect(() =>
      assertCanChangeProgramme(ctx([]), { status: "pending" })
    ).not.toThrow();
  });

  it("limits changes after approval to finance", () => {
    expect(() =>
      assertCanChangeProgramme(ctx(["requests.edit_all_statuses"]), {
        status: "approved",
      })
    ).toThrow("Only finance can change the programme after approval");
    expect(() =>
      assertCanChangeProgramme(ctx(["finance.manage"]), { status: "paid" })
    ).not.toThrow();
  });
});

describe("buildProgrammeChangeHistory", () => {
  it("records the change with programme IDs only", () => {
    const entry = buildProgrammeChangeHistory("user-1", 1000, "p1", "p2");
    expect(entry.action).toBe("updated");
    expect(entry.actorId).toBe("user-1");
    expect(entry.note).toBe("Programme changed");
    expect(entry.metadata).toEqual({
      field: "programmeId",
      from: "p1",
      to: "p2",
    });
  });
});
