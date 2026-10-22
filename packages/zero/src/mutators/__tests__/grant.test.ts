import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { assertEventProjectMovesAllowed, grantMutators } from "../grant";

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
        receivedOn: Date.UTC(2026, 9, 1),
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
    ledgerEntry: [],
    programme: [{ active: true, id: "prog-1" }],
    project: [
      { id: "proj-1", programmeId: "prog-1" },
      { id: "proj-2", programmeId: "prog-1" },
    ],
    teamEvent: [],
    utilisationCertificate: [],
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
  needsCaCertificate: false,
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

  it("links a receipt to the grant whose period covers it, any outside one", async () => {
    const db = createDb();
    await save(db);
    await save(db, {
      endsOn: "2028-03-31",
      id: "grant-2",
      startsOn: "2027-04-01",
    });
    // Received on 1 Oct 2026, inside the first grant.
    await expect(link(db, { grantId: "grant-2" })).rejects.toThrow(
      /counts towards that grant/
    );
    await link(db);
    // An advance before both periods may go to either.
    Object.assign(db.tables.contribution?.[0] ?? {}, {
      receivedOn: Date.UTC(2026, 0, 15),
    });
    await link(db, { grantId: "grant-2" });
    expect(db.tables.contribution?.[0]?.grantId).toBe("grant-2");
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

/** A live certificate of grant-1 for its first half year, to 31 Oct 2026. */
const certificate = (values: Row = {}) => ({
  grantId: "grant-1",
  id: "uc-1",
  number: "UC/2026-27/001",
  status: "awaiting_finance",
  toOn: Date.UTC(2026, 9, 31),
  ...values,
});

describe("utilisation certificates hold their range", () => {
  it("refuse linking or unlinking a gift on or before a live certificate's end", async () => {
    const db = createDb();
    await save(db);
    db.tables.utilisationCertificate?.push(certificate());
    // The gift arrived on 1 Oct 2026, inside the certificate.
    await expect(link(db)).rejects.toThrow(
      "Utilisation certificate UC/2026-27/001 covers this, so linking this contribution would change its figures. Cancel it first, then prepare a new one."
    );
    expect(db.tables.contribution?.[0]?.grantId).toBeNull();
    // A certificate ending before the gift leaves it free.
    Object.assign(db.tables.utilisationCertificate?.[0] ?? {}, {
      toOn: Date.UTC(2026, 8, 30),
    });
    await link(db);
    Object.assign(db.tables.utilisationCertificate?.[0] ?? {}, {
      toOn: Date.UTC(2026, 9, 31),
    });
    await expect(link(db, { grantId: null })).rejects.toThrow(
      /so unlinking this contribution/
    );
    // A cancelled certificate holds nothing.
    Object.assign(db.tables.utilisationCertificate?.[0] ?? {}, {
      status: "cancelled",
    });
    await link(db, { grantId: null });
    expect(db.tables.contribution?.[0]?.grantId).toBeNull();
  });

  it("refuse moving the grant's project or dates under a live certificate", async () => {
    const db = createDb();
    await save(db);
    db.tables.utilisationCertificate?.push(certificate());
    await expect(save(db, { projectId: "proj-2" })).rejects.toThrow(
      /so changing the grant's project or dates would change its figures/
    );
    // A later start would drop spend the certificate counts.
    await expect(save(db, { startsOn: "2026-05-01" })).rejects.toThrow(
      /UC\/2026-27\/001/
    );
    // An end before the certificate's leaves its period outside the grant.
    await expect(save(db, { endsOn: "2026-10-15" })).rejects.toThrow(
      /UC\/2026-27\/001/
    );
    // An end moved after the certificate touches nothing it counts.
    await save(db, { endsOn: "2027-06-30" });
    await save(db, { title: "Renamed" });
    // Cancelled, it holds nothing.
    Object.assign(db.tables.utilisationCertificate?.[0] ?? {}, {
      status: "cancelled",
    });
    await save(db, { projectId: "proj-2" });
  });

  it("keep a grant with certificates from being deleted", async () => {
    const db = createDb();
    await save(db);
    db.tables.utilisationCertificate?.push(
      certificate({ status: "discarded" })
    );
    await expect(
      run(grantMutators.delete, db, { id: "grant-1" })
    ).rejects.toThrow(/has utilisation certificates/);
  });

  it("refuse moving an event's project when its spend inside a certificate would move", async () => {
    const spend = (economicOn: number) => ({
      accountHeadId: "h-travel",
      economicOn,
      eventId: "ev-1",
      id: `le-${economicOn}`,
      medium: "monetary",
      reversesEntryId: null,
    });
    const db = createDb({
      ledgerEntry: [spend(Date.UTC(2026, 9, 2))],
      // After the edit: the event now on another project.
      teamEvent: [{ id: "ev-1", projectId: "proj-2" }],
    });
    await save(db);
    db.tables.utilisationCertificate?.push(certificate());
    const before = new Map([["ev-1", "proj-1"]]);
    await expect(
      assertEventProjectMovesAllowed(db.tx as never, before)
    ).rejects.toThrow(/so moving the event's project would change/);
    // Spend after the certificate's end moves freely.
    db.tables.ledgerEntry = [spend(Date.UTC(2026, 10, 15))];
    await assertEventProjectMovesAllowed(db.tx as never, before);
    // An event whose project didn't change is never checked.
    db.tables.ledgerEntry = [spend(Date.UTC(2026, 9, 2))];
    await assertEventProjectMovesAllowed(
      db.tx as never,
      new Map([["ev-1", "proj-2"]])
    );
  });
});
