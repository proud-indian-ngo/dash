import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { budgetMutators } from "../budget";

type Row = Record<string, unknown>;

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    accountHead: [
      { id: "h-travel", type: "expense" },
      { id: "h-bank", type: "expense" },
    ],
    budget: [],
    budgetLine: [],
    expenseCategory: [{ accountHeadId: "h-travel", id: "c-travel" }],
    fiscalYear: [{ id: "fy-1" }],
    programme: [
      { active: true, id: "prog-1" },
      { active: false, id: "prog-old" },
      { active: true, id: UNALLOCATED },
    ],
    project: [],
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
      const rows = (tables[query.ast.table] ?? [])
        .filter((row) =>
          matchesScope(
            row as ScopeRow,
            query.ast.where,
            tables as unknown as ScopeTables
          )
        )
        .map((row) =>
          query.ast.table === "budget"
            ? {
                ...row,
                lines: (tables.budgetLine ?? []).filter(
                  (l) => l.budgetId === row.id
                ),
              }
            : row
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

const save = (db: ReturnType<typeof createDb>, args: Row) =>
  budgetMutators.save.fn({
    args: {
      fiscalYearId: "fy-1",
      id: "b-1",
      note: null,
      programmeId: "prog-1",
      projectId: null,
      ...args,
    },
    ctx,
    tx: db.tx,
  } as never);

const line = (accountHeadId: string, amountPaise = 1000) => ({
  accountHeadId,
  amountPaise,
  id: `l-${accountHeadId}`,
});

describe("budget.save", () => {
  it("budgets the heads expense categories post to", async () => {
    const db = createDb();
    await save(db, { lines: [line("h-travel")] });
    expect(db.tables.budgetLine).toHaveLength(1);
  });

  it("refuses a head no category posts to", async () => {
    const db = createDb();
    await expect(save(db, { lines: [line("h-bank")] })).rejects.toThrow(
      "Only the expense heads of expense categories"
    );
  });

  it("keeps a head the budget already holds", async () => {
    const db = createDb({
      budget: [
        {
          fiscalYearId: "fy-1",
          id: "b-1",
          programmeId: "prog-1",
          projectId: null,
        },
      ],
      budgetLine: [{ ...line("h-bank"), budgetId: "b-1" }],
    });
    await save(db, { lines: [line("h-bank", 2000)] });
    expect(db.tables.budgetLine?.[0]?.amountPaise).toBe(2000);
  });

  it("refuses a new budget for an inactive or Unallocated programme", async () => {
    for (const programmeId of ["prog-old", UNALLOCATED]) {
      const db = createDb();
      await expect(
        save(db, { lines: [line("h-travel")], programmeId })
      ).rejects.toThrow("Pick an active programme");
    }
  });

  it("edits and removes a retired programme's standing budget", async () => {
    const standing = () =>
      createDb({
        budget: [
          {
            fiscalYearId: "fy-1",
            id: "b-old",
            programmeId: "prog-old",
            projectId: null,
          },
        ],
        budgetLine: [{ ...line("h-travel"), budgetId: "b-old" }],
      });
    const edited = standing();
    await save(edited, {
      id: "b-old",
      lines: [line("h-travel", 5000)],
      programmeId: "prog-old",
    });
    expect(edited.tables.budgetLine?.[0]?.amountPaise).toBe(5000);

    const removed = standing();
    await save(removed, { id: "b-old", lines: [], programmeId: "prog-old" });
    expect(removed.tables.budget).toEqual([]);
    expect(removed.tables.budgetLine).toEqual([]);
  });

  it("removes the budget when every head is blank", async () => {
    const db = createDb({
      budget: [
        {
          fiscalYearId: "fy-1",
          id: "b-1",
          programmeId: "prog-1",
          projectId: null,
        },
      ],
      budgetLine: [{ ...line("h-travel"), budgetId: "b-1" }],
    });
    await save(db, { lines: [] });
    expect(db.tables.budget).toEqual([]);
    expect(db.tables.budgetLine).toEqual([]);
  });
});
