import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { policyMutators } from "../policies";

type Row = Record<string, unknown>;

function createDb(versions: Row[] = []) {
  const tables: Record<string, Row[]> = {
    policy: [
      {
        audience: "everyone",
        description: null,
        id: "conduct",
        key: null,
        title: "Code of conduct",
      },
      {
        audience: "everyone",
        id: "safeguarding",
        key: "child_safeguarding",
        title: "Child-safeguarding policy",
      },
    ],
    policyVersion: versions,
  };
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      tables[table] = (tables[table] ?? []).filter((r) => r.id !== row.id);
    },
    update: async (row: Row) => {
      const current = tables[table]?.find((item) => item.id === row.id);
      if (current) {
        Object.assign(current, row);
      }
    },
  });
  const tx = {
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
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
  return { tables, tx };
}

const manager = {
  permissions: ["governance.manage"],
  role: "admin",
  userId: "admin",
};
const viewer = {
  permissions: ["governance.view"],
  role: "volunteer",
  userId: "ravi",
};
const published = [{ id: "v1", policyId: "conduct", version: 1 }];

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

const edit = (overrides: Row = {}) => ({
  audience: "everyone",
  description: "How we behave",
  id: "conduct",
  title: "Volunteer code of conduct",
  ...overrides,
});

describe("editing a policy", () => {
  it("changes the title and description after a version is published", async () => {
    const db = createDb(published);
    await run(policyMutators.update, db, manager, edit());
    expect(db.tables.policy?.[0]).toMatchObject({
      description: "How we behave",
      title: "Volunteer code of conduct",
    });
  });

  it("changes who it's for until version 1 is published", async () => {
    const db = createDb();
    await run(
      policyMutators.update,
      db,
      manager,
      edit({ audience: "trustees" })
    );
    expect(db.tables.policy?.[0]?.audience).toBe("trustees");
  });

  it("keeps who it's for once a version is published", async () => {
    const db = createDb(published);
    await expect(
      run(policyMutators.update, db, manager, edit({ audience: "trustees" }))
    ).rejects.toThrow("can't change once a version is published");
    expect(db.tables.policy?.[0]?.audience).toBe("everyone");
  });

  it("keeps who the dashboard's own policy is for", async () => {
    const db = createDb();
    await expect(
      run(
        policyMutators.update,
        db,
        manager,
        edit({ audience: "trustees", id: "safeguarding" })
      )
    ).rejects.toThrow("the dashboard relies on this policy");
    expect(db.tables.policy?.[1]?.audience).toBe("everyone");
  });

  it("still edits the title of the dashboard's own policy", async () => {
    const db = createDb();
    await run(
      policyMutators.update,
      db,
      manager,
      edit({ id: "safeguarding", title: "Child safeguarding" })
    );
    expect(db.tables.policy?.[1]?.title).toBe("Child safeguarding");
  });

  it("needs governance.manage", async () => {
    const db = createDb();
    await expect(
      run(policyMutators.update, db, viewer, edit())
    ).rejects.toThrow();
    expect(db.tables.policy?.[0]?.title).toBe("Code of conduct");
  });
});

describe("deleting a policy", () => {
  it("deletes one with no versions", async () => {
    const db = createDb();
    await run(policyMutators.delete, db, manager, { id: "conduct" });
    expect(db.tables.policy?.map((p) => p.id)).toEqual(["safeguarding"]);
  });

  it("refuses one with a published version", async () => {
    const db = createDb(published);
    await expect(
      run(policyMutators.delete, db, manager, { id: "conduct" })
    ).rejects.toThrow("can't be deleted");
    expect(db.tables.policy).toHaveLength(2);
  });

  it("keeps the dashboard's own policies", async () => {
    const db = createDb();
    await expect(
      run(policyMutators.delete, db, manager, { id: "safeguarding" })
    ).rejects.toThrow("stays");
  });

  it("needs governance.manage", async () => {
    const db = createDb();
    await expect(
      run(policyMutators.delete, db, viewer, { id: "conduct" })
    ).rejects.toThrow();
    expect(db.tables.policy).toHaveLength(2);
  });
});
