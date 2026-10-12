import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { resolveProgrammeId } from "../team-event";

type Row = Record<string, unknown>;

function fakeTx(
  tables: Partial<Record<string, Row[]>>,
  location: "client" | "server" = "server"
) {
  const all: Record<string, Row[]> = { programme: [], team: [], ...tables };
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

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

describe("resolveProgrammeId", () => {
  it("keeps an explicit active programme", async () => {
    const tx = fakeTx({ programme: [{ active: true, id: "p1" }] });
    expect(await resolveProgrammeId(tx, "p1", "t1")).toBe("p1");
  });

  it("rejects an inactive programme and, on the server, an unknown one", async () => {
    const tx = fakeTx({ programme: [{ active: false, id: "p1" }] });
    await expect(resolveProgrammeId(tx, "p1", "t1")).rejects.toThrow(
      "Choose an active programme"
    );
    await expect(resolveProgrammeId(tx, "missing", "t1")).rejects.toThrow(
      "Programme not found"
    );
  });

  it("tolerates a cache miss on the client", async () => {
    const tx = fakeTx({}, "client");
    expect(await resolveProgrammeId(tx, "not-synced-yet", "t1")).toBe(
      "not-synced-yet"
    );
  });

  it("falls back to the team's programme, then Unallocated", async () => {
    const withTeam = fakeTx({ team: [{ id: "t1", programmeId: "p9" }] });
    expect(await resolveProgrammeId(withTeam, undefined, "t1")).toBe("p9");
    const noTeam = fakeTx({ team: [{ id: "t1", programmeId: null }] });
    expect(await resolveProgrammeId(noTeam, undefined, "t1")).toBe(UNALLOCATED);
  });
});
