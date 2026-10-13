import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { partyMutators } from "../party";

type Row = Record<string, unknown>;

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = { party: [], partyRole: [], ...seed };
  const writes: { action: string; row: Row; table: string }[] = [];
  const api = (table: string) => ({
    insert: async (row: Row) => {
      writes.push({ action: "insert", row, table });
      tables[table]?.push(row);
    },
    update: async (row: Row) => {
      writes.push({ action: "update", row, table });
      Object.assign(tables[table]?.find((r) => r.id === row.id) ?? {}, row);
    },
  });
  const tx = {
    location: "server",
    mutate: Object.fromEntries(Object.keys(tables).map((t) => [t, api(t)])),
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
  };
  return { tables, tx, writes };
}

const run = (
  mutator: { fn: (input: never) => Promise<void> },
  db: ReturnType<typeof createDb>,
  ctx: Row,
  args: Row
) => mutator.fn({ args, ctx, tx: db.tx } as never);

const manager = {
  permissions: ["donors.manage"],
  role: "finance_admin",
  userId: "f1",
};
const viewer = { permissions: ["donors.view"], role: "admin", userId: "a1" };

describe("party mutators", () => {
  it("needs donors.manage", async () => {
    const db = createDb();
    await expect(
      run(partyMutators.create, db, viewer, {
        displayName: "Asha",
        id: "p1",
        kind: "person",
        roleIds: ["r1"],
        roles: ["donor"],
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("creates the party with one row per distinct role", async () => {
    const db = createDb();
    await run(partyMutators.create, db, manager, {
      displayName: "Asha",
      id: "p1",
      kind: "person",
      roleIds: ["r1", "r2", "r3"],
      roles: ["donor", "sponsor", "donor"],
    });
    expect(db.tables.party).toHaveLength(1);
    expect(db.tables.partyRole?.map((r) => r.role)).toEqual([
      "donor",
      "sponsor",
    ]);
  });

  it("toggles an existing role instead of duplicating it", async () => {
    const db = createDb({
      party: [{ id: "p1" }],
      partyRole: [{ active: true, id: "r1", partyId: "p1", role: "donor" }],
    });
    await run(partyMutators.setRole, db, manager, {
      active: false,
      id: "r9",
      partyId: "p1",
      role: "donor",
    });
    expect(db.tables.partyRole).toHaveLength(1);
    expect(db.tables.partyRole?.[0]?.active).toBe(false);
    await run(partyMutators.setRole, db, manager, {
      active: true,
      id: "r10",
      partyId: "p1",
      role: "sponsor",
    });
    expect(db.tables.partyRole?.map((r) => r.role)).toEqual([
      "donor",
      "sponsor",
    ]);
  });
});
