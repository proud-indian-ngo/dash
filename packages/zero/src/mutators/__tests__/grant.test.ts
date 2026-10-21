import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { grantMutators } from "../grant";

type Row = Record<string, unknown>;

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    accountHead: [{ id: "h-travel", type: "expense" }],
    contribution: [
      {
        channel: "neft",
        grantId: null,
        grantTrancheId: null,
        id: "gift-1",
        partyId: "grantor",
        programmeId: "prog-1",
        projectId: "proj-1",
        status: "received",
      },
    ],
    expenseCategory: [{ accountHeadId: "h-travel", id: "c-travel" }],
    grantAgreement: [],
    grantBudgetLine: [],
    grantTranche: [],
    partyRole: [
      { active: true, id: "r-1", partyId: "grantor", role: "grantor" },
      { active: true, id: "r-2", partyId: "vendor", role: "vendor" },
    ],
    programme: [{ active: true, id: "prog-1" }],
    project: [
      { id: "proj-1", programmeId: "prog-1" },
      { id: "proj-2", programmeId: "prog-1" },
    ],
    ...seed,
  };
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      tables[table] = (tables[table] ?? []).filter((r) => r.id !== row.id);
    },
    insert: async (row: Row) => {
      tables[table]?.push(row);
    },
    update: async (row: Row) => {
      Object.assign(tables[table]?.find((r) => r.id === row.id) ?? {}, row);
    },
  });
  const tx = {
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
      const rows = (tables[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          tables as unknown as ScopeTables
        )
      );
      return query.format.singular ? rows[0] : rows;
    },
  };
  return { tables, tx };
}

const ctx = {
  permissions: ["finance.manage"],
  role: "finance_admin",
  userId: "fin-1",
};

const grantArgs = {
  agreementOn: null,
  agreementReference: null,
  donationType: "csr",
  endsOn: "2027-03-31",
  id: "grant-1",
  notes: null,
  partyId: "grantor",
  programmeId: "prog-1",
  projectId: "proj-1",
  sanctionedPaise: 1_000_000,
  scheduleViiItem: null,
  startsOn: "2026-04-01",
  status: "active",
  title: "Library grant",
};

const run = (
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  args: Row,
  context: Row = ctx
) => mutator.fn({ args, ctx: context, tx: db.tx } as never);

const save = (db: ReturnType<typeof createDb>, args: Row = {}) =>
  run(grantMutators.save, db, { ...grantArgs, ...args });

const link = (db: ReturnType<typeof createDb>, args: Row = {}) =>
  run(grantMutators.linkContribution, db, {
    contributionId: "gift-1",
    grantId: "grant-1",
    trancheId: null,
    ...args,
  });

describe("grant.save", () => {
  it("needs finance.manage", async () => {
    const db = createDb();
    await expect(
      run(grantMutators.save, db, grantArgs, {
        ...ctx,
        permissions: ["finance.view"],
      })
    ).rejects.toThrow();
  });

  it("lets a project have several grants, never overlapping", async () => {
    const db = createDb();
    await save(db);
    expect(db.tables.grantAgreement).toHaveLength(1);
    await expect(
      save(db, { endsOn: "2027-06-30", id: "grant-2", startsOn: "2027-03-31" })
    ).rejects.toThrow(/can't overlap/);
    await save(db, {
      endsOn: "2028-03-31",
      id: "grant-2",
      startsOn: "2027-04-01",
    });
    await save(db, { id: "grant-3", projectId: "proj-2" });
    expect(db.tables.grantAgreement).toHaveLength(3);
  });

  it("needs a grantor that gives in its own right", async () => {
    const db = createDb();
    await expect(save(db, { partyId: "vendor" })).rejects.toThrow(/grantor/);
  });

  it("keeps the grantor and project while contributions are linked", async () => {
    const db = createDb();
    await save(db);
    await link(db);
    await expect(save(db, { projectId: "proj-2" })).rejects.toThrow(
      /Unlink them first/
    );
    await save(db, { title: "Renamed" });
    expect(db.tables.grantAgreement?.[0]?.title).toBe("Renamed");
  });
});

describe("grant.linkContribution", () => {
  it("links the grantor's gift on the grant's project, with a tranche", async () => {
    const db = createDb();
    await save(db);
    await run(grantMutators.saveTranches, db, {
      grantId: "grant-1",
      tranches: [
        {
          amountPaise: 500_000,
          expectedOn: "2026-05-01",
          id: "t-1",
          note: null,
        },
      ],
    });
    await link(db, { trancheId: "t-1" });
    expect(db.tables.contribution?.[0]).toMatchObject({
      grantId: "grant-1",
      grantTrancheId: "t-1",
    });
    // Removing the tranche keeps the gift on the grant.
    await run(grantMutators.saveTranches, db, {
      grantId: "grant-1",
      tranches: [],
    });
    expect(db.tables.contribution?.[0]).toMatchObject({
      grantId: "grant-1",
      grantTrancheId: null,
    });
    await link(db, { grantId: null });
    expect(db.tables.contribution?.[0]?.grantId).toBeNull();
  });

  it("refuses another giver, another project and a reversed gift", async () => {
    for (const gift of [
      { partyId: "someone-else" },
      { projectId: "proj-2" },
      { status: "reversed" },
      { channel: "in_kind" },
    ]) {
      const db = createDb();
      await save(db);
      Object.assign(db.tables.contribution?.[0] ?? {}, gift);
      await expect(link(db)).rejects.toThrow();
      expect(db.tables.contribution?.[0]?.grantId).toBeNull();
    }
  });

  it("refuses another grant's tranche", async () => {
    const db = createDb({
      grantTranche: [{ grantId: "grant-other", id: "t-other" }],
    });
    await save(db);
    await expect(link(db, { trancheId: "t-other" })).rejects.toThrow(
      /Tranche not found/
    );
  });
});

describe("grant.delete", () => {
  it("refuses while contributions are linked", async () => {
    const db = createDb();
    await save(db);
    await link(db);
    await expect(
      run(grantMutators.delete, db, { id: "grant-1" })
    ).rejects.toThrow(/Unlink/);
    await link(db, { grantId: null });
    await run(grantMutators.delete, db, { id: "grant-1" });
    expect(db.tables.grantAgreement).toHaveLength(0);
  });
});

describe("grant.saveBudget", () => {
  it("budgets expense category heads, ₹0 included", async () => {
    const db = createDb();
    await save(db);
    await run(grantMutators.saveBudget, db, {
      grantId: "grant-1",
      lines: [{ accountHeadId: "h-travel", amountPaise: 0, id: "l-1" }],
    });
    expect(db.tables.grantBudgetLine).toEqual([
      {
        accountHeadId: "h-travel",
        amountPaise: 0,
        grantId: "grant-1",
        id: "l-1",
      },
    ]);
    await expect(
      run(grantMutators.saveBudget, db, {
        grantId: "grant-1",
        lines: [{ accountHeadId: "h-other", amountPaise: 10, id: "l-2" }],
      })
    ).rejects.toThrow(/can be budgeted/);
  });
});
