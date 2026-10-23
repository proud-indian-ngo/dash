import { describe, expect, it } from "bun:test";

import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  accountHeadMutators,
  costCentreMutators,
  fundMutators,
  orgAccountInputSchema,
  orgAccountMutators,
  programmeMutators,
  projectMutators,
} from "../finance-dimensions";

type Row = Record<string, unknown>;

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    accountHead: [],
    budget: [],
    costCentre: [],
    fund: [],
    ledgerEntry: [],
    orgAccount: [],
    programme: [],
    project: [],
    reimbursement: [],
    user: [],
    vendorPayment: [],
    ...seed,
  };
  const writes: { action: string; row: Row; table: string }[] = [];
  const tableApi = (table: string) => ({
    insert: async (row: Row) => {
      writes.push({ action: "insert", row, table });
      tables[table]?.push(row);
    },
    update: async (row: Row) => {
      writes.push({ action: "update", row, table });
      const current = tables[table]?.find((item) => item.id === row.id);
      if (!current) {
        throw new Error(`Missing ${table} ${String(row.id)}`);
      }
      Object.assign(current, row);
    },
  });
  const locks: string[] = [];
  const tx = {
    // The server's row locks (the active cost centres before deactivating).
    dbTransaction: {
      wrappedTransaction: {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async (mode: string) => {
                locks.push(mode);
                return [];
              },
            }),
          }),
        }),
      },
    },
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
  return { locks, tables, tx, writes };
}

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row | undefined,
  args: Row
) {
  const context = ctx
    ? {
        ...ctx,
        loadPrivateUser: async (id: string) => {
          const row = db.tables.user?.find((user) => user.id === id);
          return row
            ? {
                banned: (row.banned as boolean | null | undefined) ?? false,
                email: (row.email as string | undefined) ?? `${id}@example.com`,
                isActive: (row.isActive as boolean | undefined) ?? true,
                name: (row.name as string | undefined) ?? id,
                phone: (row.phone as string | null | undefined) ?? null,
                role: row.role as string,
              }
            : null;
        },
      }
    : undefined;
  return mutator.fn({ args, ctx: context, tx: db.tx } as never);
}

const financeCtx = {
  permissions: ["finance.manage"],
  role: "finance_admin",
  userId: "fin-1",
};
const volunteerCtx = {
  permissions: ["events.view_own"],
  role: "volunteer",
  userId: "vol-1",
};

function programme(overrides: Row = {}): Row {
  return {
    active: true,
    cause: "education",
    code: "EDU",
    description: null,
    id: "prog-1",
    leadUserId: null,
    name: "Education",
    sortOrder: 10,
    ...overrides,
  };
}

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

describe("programme mutators", () => {
  it("refuses a caller without finance.manage", async () => {
    const db = createDb();
    await expect(
      run(programmeMutators.create, db, volunteerCtx, programme())
    ).rejects.toThrow("Unauthorized");
    expect(db.writes).toEqual([]);
  });

  it("rejects a duplicate code and a duplicate name", async () => {
    const db = createDb({ programme: [programme()] });
    await expect(
      run(
        programmeMutators.create,
        db,
        financeCtx,
        programme({ id: "prog-2", name: "Other" })
      )
    ).rejects.toThrow("Code EDU is already used");
    await expect(
      run(
        programmeMutators.create,
        db,
        financeCtx,
        programme({ code: "OTH", id: "prog-2" })
      )
    ).rejects.toThrow('Name "Education" is already used');
  });

  it("rejects an external or banned lead", async () => {
    const db = createDb({
      user: [
        { banned: false, id: "ext-1", role: "external_user" },
        { banned: true, id: "ban-1", role: "volunteer" },
        { banned: false, id: "ok-1", role: "volunteer" },
      ],
    });
    for (const leadUserId of ["ext-1", "ban-1", "missing"]) {
      await expect(
        run(programmeMutators.create, db, financeCtx, programme({ leadUserId }))
      ).rejects.toThrow("Programme lead must be an active internal user");
    }
    await run(
      programmeMutators.create,
      db,
      financeCtx,
      programme({ leadUserId: "ok-1" })
    );
    expect(db.writes).toHaveLength(1);
  });

  it("fails closed without the server private user loader", async () => {
    const db = createDb({
      user: [{ banned: false, id: "lead-1", role: "volunteer" }],
    });

    await expect(
      programmeMutators.create.fn({
        args: programme({ leadUserId: "lead-1" }),
        ctx: financeCtx,
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Private user loader is required");
    expect(db.writes).toEqual([]);
  });

  it("keeps existing values for omitted fields on update", async () => {
    const db = createDb({
      programme: [programme({ active: false, description: "Classes" })],
    });
    await run(programmeMutators.update, db, financeCtx, {
      code: "EDU",
      id: "prog-1",
      name: "Education",
    });
    const row = db.tables.programme?.[0];
    expect(row?.active).toBe(false);
    expect(row?.description).toBe("Classes");
    expect(row?.cause).toBe("education");
  });

  it("will not deactivate the Unallocated holding programme", async () => {
    const db = createDb({
      programme: [
        programme({ code: "UNALLOC", id: UNALLOCATED, name: "Unallocated" }),
      ],
    });
    await expect(
      run(programmeMutators.update, db, financeCtx, {
        active: false,
        code: "UNALLOC",
        id: UNALLOCATED,
        name: "Unallocated",
      })
    ).rejects.toThrow("cannot be deactivated");
  });
});

describe("project mutators", () => {
  it("converts ISO dates to UTC midnight and rejects impossible dates", async () => {
    const db = createDb({ programme: [programme()] });
    await run(projectMutators.create, db, financeCtx, {
      code: "P1",
      id: "proj-1",
      name: "Project",
      programmeId: "prog-1",
      startsOn: "2026-04-01",
    });
    expect(db.tables.project?.[0]?.startsOn).toBe(Date.UTC(2026, 3, 1));
    await expect(
      run(projectMutators.create, db, financeCtx, {
        code: "P2",
        id: "proj-2",
        name: "Bad",
        programmeId: "prog-1",
        startsOn: "2026-02-30",
      })
    ).rejects.toThrow();
  });

  it("refuses an inactive programme", async () => {
    const db = createDb({ programme: [programme({ active: false })] });
    await expect(
      run(projectMutators.create, db, financeCtx, {
        code: "P1",
        id: "proj-1",
        name: "Project",
        programmeId: "prog-1",
      })
    ).rejects.toThrow("inactive programme");
  });
});

describe("moving a project to another programme", () => {
  const project = (overrides: Row = {}): Row => ({
    code: "P1",
    id: "proj-1",
    kind: "class",
    name: "Project",
    programmeId: "prog-1",
    ...overrides,
  });
  const move = {
    code: "P1",
    id: "proj-1",
    name: "Project",
    programmeId: "prog-2",
  };
  const programmes = [
    programme(),
    programme({ code: "ART", id: "prog-2", name: "Arts" }),
  ];

  it("refuses while an expense is charged to the project", async () => {
    for (const table of ["reimbursement", "vendorPayment"]) {
      const db = createDb({
        programme: programmes,
        project: [project()],
        [table]: [{ chargedProjectId: "proj-1", id: "x-1" }],
      });
      await expect(
        run(projectMutators.update, db, financeCtx, move)
      ).rejects.toThrow("Expenses are charged to this project");
    }
  });

  it("refuses while the project has a budget", async () => {
    const db = createDb({
      budget: [{ id: "b-1", programmeId: "prog-1", projectId: "proj-1" }],
      programme: programmes,
      project: [project()],
    });
    await expect(
      run(projectMutators.update, db, financeCtx, move)
    ).rejects.toThrow("This project has a budget");
  });

  it("refuses while events name the project", async () => {
    const db = createDb({
      programme: programmes,
      project: [project()],
      teamEvent: [{ id: "e-1", programmeId: "prog-1", projectId: "proj-1" }],
    });
    await expect(
      run(projectMutators.update, db, financeCtx, move)
    ).rejects.toThrow("Events name this project");
  });

  it("moves a project nothing is charged to", async () => {
    const db = createDb({ programme: programmes, project: [project()] });
    await run(projectMutators.update, db, financeCtx, move);
    expect(db.tables.project?.[0]?.programmeId).toBe("prog-2");
  });
});

describe("fund mutators", () => {
  const general = {
    active: true,
    code: "GEN",
    description: null,
    id: GENERAL_FUND_ID,
    name: "General Fund (Domestic)",
    restriction: "unrestricted",
    source: "domestic",
  };

  it("needs finance.manage", async () => {
    await expect(
      run(fundMutators.create, createDb(), volunteerCtx, {
        code: "BUILD",
        id: "fund-1",
        name: "Building Fund",
      })
    ).rejects.toThrow();
  });

  it("adds a fund, unrestricted and domestic unless told otherwise", async () => {
    const db = createDb();
    await run(fundMutators.create, db, financeCtx, {
      code: "BUILD",
      id: "fund-1",
      name: "Building Fund",
    });
    expect(db.tables.fund?.[0]).toMatchObject({
      active: true,
      restriction: "unrestricted",
      source: "domestic",
    });
  });

  it("keeps the General Fund active, but deactivates others", async () => {
    const db = createDb({
      fund: [general, { ...general, code: "BUILD", id: "fund-1", name: "B" }],
    });
    await expect(
      run(fundMutators.update, db, financeCtx, { ...general, active: false })
    ).rejects.toThrow("cannot be deactivated");
    await run(fundMutators.update, db, financeCtx, {
      active: false,
      code: "BUILD",
      id: "fund-1",
      name: "B",
    });
    expect(db.tables.fund?.[1]?.active).toBe(false);
  });
});

describe("account head mutators", () => {
  const head = (overrides: Row = {}): Row => ({
    active: true,
    code: "EXP",
    description: null,
    id: "h-1",
    name: "Expenses",
    parentId: null,
    sortOrder: 0,
    tallyLedgerName: null,
    type: "expense",
    ...overrides,
  });

  it("requires the parent to exist with the same type", async () => {
    const db = createDb({ accountHead: [head({ type: "income" })] });
    await expect(
      run(
        accountHeadMutators.create,
        db,
        financeCtx,
        head({ code: "TRV", id: "h-2", name: "Travel", parentId: "h-1" })
      )
    ).rejects.toThrow("same type");
    await expect(
      run(
        accountHeadMutators.create,
        db,
        financeCtx,
        head({ code: "TRV", id: "h-2", name: "Travel", parentId: "nope" })
      )
    ).rejects.toThrow("Parent account head not found");
  });

  it("detects a parent cycle", async () => {
    const db = createDb({
      accountHead: [
        head(),
        head({ code: "TRV", id: "h-2", name: "Travel", parentId: "h-1" }),
      ],
    });
    await expect(
      run(accountHeadMutators.update, db, financeCtx, head({ parentId: "h-2" }))
    ).rejects.toThrow("cycle");
  });

  it("keeps a head the books post under on its type and active", async () => {
    const db = createDb({
      accountHead: [head()],
      ledgerEntry: [{ accountHeadId: "h-1", id: "e-1" }],
    });
    await expect(
      run(accountHeadMutators.update, db, financeCtx, head({ type: "income" }))
    ).rejects.toThrow("its type can't change");
    await expect(
      run(accountHeadMutators.update, db, financeCtx, head({ active: false }))
    ).rejects.toThrow("can't be deactivated");
    await run(
      accountHeadMutators.update,
      db,
      financeCtx,
      head({ name: "Programme expenses" })
    );
    expect(db.tables.accountHead?.[0]).toMatchObject({
      name: "Programme expenses",
    });
  });

  it("protects the books' reference heads even before anything posts", async () => {
    const fundBalance = head({
      code: "FUND_BALANCE",
      id: LEDGER_ACCOUNT_HEAD_IDS.fundBalance,
      name: "Fund balance",
      type: "fund",
    });
    const db = createDb({ accountHead: [fundBalance] });
    await expect(
      run(accountHeadMutators.update, db, financeCtx, {
        ...fundBalance,
        active: false,
      })
    ).rejects.toThrow("can't be deactivated");
  });

  it("keeps a parent head on its type while it has children", async () => {
    const db = createDb({
      accountHead: [
        head(),
        head({ code: "TRV", id: "h-2", name: "Travel", parentId: "h-1" }),
      ],
    });
    await expect(
      run(accountHeadMutators.update, db, financeCtx, head({ type: "income" }))
    ).rejects.toThrow("Move this head's children");
    await run(
      accountHeadMutators.update,
      db,
      financeCtx,
      head({ name: "Programme expenses" })
    );
    expect(db.tables.accountHead?.[0]).toMatchObject({
      name: "Programme expenses",
      type: "expense",
    });
  });

  it("lets an unused head change type or be deactivated", async () => {
    const db = createDb({ accountHead: [head()] });
    await run(
      accountHeadMutators.update,
      db,
      financeCtx,
      head({ active: false, type: "income" })
    );
    expect(db.tables.accountHead?.[0]).toMatchObject({
      active: false,
      type: "income",
    });
  });
});

describe("organisation account mutators", () => {
  const account = (overrides: Row = {}): Row => ({
    id: "acc-1",
    kind: "bank",
    name: "HDFC current",
    ...overrides,
  });

  it("requires finance.manage", async () => {
    const db = createDb();
    await expect(
      run(orgAccountMutators.create, db, volunteerCtx, account())
    ).rejects.toThrow();
    await expect(
      run(orgAccountMutators.create, db, undefined, account())
    ).rejects.toThrow();
    expect(db.writes).toEqual([]);
  });

  it("rejects an empty name, unknown kind or unknown fund source", () => {
    for (const overrides of [
      { name: "  " },
      { kind: "wallet" },
      { fundSource: "foreign" },
      { fcraRole: "both" },
    ]) {
      expect(orgAccountInputSchema.safeParse(account(overrides)).success).toBe(
        false
      );
    }
    expect(orgAccountInputSchema.safeParse(account()).success).toBe(true);
  });

  it("rejects a name another account already uses", async () => {
    const db = createDb({ orgAccount: [account()] });
    await expect(
      run(orgAccountMutators.create, db, financeCtx, account({ id: "acc-2" }))
    ).rejects.toThrow('Name "HDFC current" is already used');
  });

  it("keeps an FCRA role only on FCRA accounts", async () => {
    const db = createDb();
    await run(
      orgAccountMutators.create,
      db,
      financeCtx,
      account({ fcraRole: "receipt", fundSource: "fcra" })
    );
    await run(
      orgAccountMutators.create,
      db,
      financeCtx,
      account({ fcraRole: "receipt", id: "acc-2", name: "Cash box" })
    );
    expect(db.tables.orgAccount?.map((a) => a.fcraRole)).toEqual([
      "receipt",
      "none",
    ]);

    await run(
      orgAccountMutators.update,
      db,
      financeCtx,
      account({ fcraRole: "receipt", fundSource: "domestic" })
    );
    expect(db.tables.orgAccount?.[0]).toMatchObject({
      fcraRole: "none",
      fundSource: "domestic",
    });
  });

  it("deactivates instead of deleting", async () => {
    const db = createDb({ orgAccount: [account({ active: true })] });
    expect("delete" in orgAccountMutators).toBe(false);
    await run(
      orgAccountMutators.update,
      db,
      financeCtx,
      account({ active: false })
    );
    expect(db.tables.orgAccount?.[0]?.active).toBe(false);
  });

  it("refuses to update a missing account", async () => {
    const db = createDb();
    await expect(
      run(orgAccountMutators.update, db, financeCtx, account())
    ).rejects.toThrow("Organisation account not found");
  });
});

describe("cost centre mutators", () => {
  const centre = (over: Row = {}) => ({
    active: true,
    code: "BLR",
    id: "cc-blr",
    name: "Bangalore",
    stateUt: "Karnataka",
    ...over,
  });

  it("needs finance.manage", async () => {
    const db = createDb();
    await expect(
      run(costCentreMutators.create, db, { permissions: [] }, centre())
    ).rejects.toThrow();
  });

  it("adds one with a unique code and name", async () => {
    const db = createDb({ costCentre: [centre()] });
    await expect(
      run(costCentreMutators.create, db, financeCtx, centre({ id: "cc-2" }))
    ).rejects.toThrow("Code BLR is already used");
    await run(
      costCentreMutators.create,
      db,
      financeCtx,
      centre({ code: "PNQ", id: "cc-pnq", name: "Pune", stateUt: null })
    );
    expect(db.tables.costCentre?.find((c) => c.id === "cc-pnq")).toMatchObject({
      active: true,
      code: "PNQ",
      name: "Pune",
    });
  });

  it("refuses the codes the public feed reads as Bangalore", async () => {
    const db = createDb();
    await expect(
      run(
        costCentreMutators.create,
        db,
        financeCtx,
        centre({ code: "BENGALURU", id: "cc-x", name: "X" })
      )
    ).rejects.toThrow("Code BENGALURU is reserved");
  });

  it("renames, but never changes the code", async () => {
    const db = createDb({ costCentre: [centre()] });
    await run(
      costCentreMutators.update,
      db,
      financeCtx,
      centre({ name: "Bengaluru" })
    );
    expect(db.tables.costCentre?.[0]).toMatchObject({ name: "Bengaluru" });
    await expect(
      run(costCentreMutators.update, db, financeCtx, centre({ code: "BLX" }))
    ).rejects.toThrow("A cost centre's code can't be changed");
  });

  it("keeps the last active centre active, and reactivates", async () => {
    const db = createDb({
      costCentre: [
        centre(),
        centre({ active: false, code: "MUM", id: "cc-mum", name: "Mumbai" }),
      ],
    });
    await expect(
      run(costCentreMutators.update, db, financeCtx, centre({ active: false }))
    ).rejects.toThrow("At least one cost centre must stay active");
    // Read under a lock on the active rows, so two deactivations can't race.
    expect(db.locks).toEqual(["update"]);
    await run(
      costCentreMutators.update,
      db,
      financeCtx,
      centre({ active: true, code: "MUM", id: "cc-mum", name: "Mumbai" })
    );
    await run(
      costCentreMutators.update,
      db,
      financeCtx,
      centre({ active: false })
    );
    expect(db.tables.costCentre?.map((c) => c.active)).toEqual([false, true]);
  });
});
