import { describe, expect, it } from "bun:test";

import { GIVE_INDIA_PARTY_ID, PROGRAMME_IDS } from "@pi-dash/shared/constants";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  contributionInputSchema,
  contributionMutators,
  otherIncomeMutators,
} from "../income";

type Row = Record<string, unknown>;

function createDb(
  seed: Partial<Record<string, Row[]>> = {},
  location = "server"
) {
  const tables: Record<string, Row[]> = {
    contribution: [],
    contributionRefund: [],
    fund: [{ active: true, id: "fund-1" }],
    gatewaySettlement: [],
    gatewaySettlementItem: [],
    orgAccount: [
      { active: true, id: "acc-1" },
      { active: false, id: "acc-old" },
    ],
    otherIncome: [],
    partyRole: [
      { active: true, id: "r1", partyId: "donor-1", role: "donor" },
      { active: false, id: "r2", partyId: "lapsed-1", role: "donor" },
      { active: true, id: "r3", partyId: "vendor-1", role: "vendor" },
      { active: true, id: "r4", partyId: "sponsor-1", role: "sponsor" },
      { active: true, id: "r5", partyId: "grantor-1", role: "grantor" },
      {
        active: true,
        id: "r6",
        partyId: "goodera-1",
        role: "intermediary",
      },
      {
        active: true,
        id: "r7",
        partyId: GIVE_INDIA_PARTY_ID,
        role: "intermediary",
      },
    ],
    programme: [
      { active: true, id: "prog-edu" },
      { active: true, id: "prog-arts" },
      { active: true, id: PROGRAMME_IDS.unallocated },
    ],
    project: [{ id: "proj-k3", programmeId: "prog-arts" }],
    ...seed,
  };
  const writes: { action: string; row: Row; table: string }[] = [];
  /** Row locks the server run took, as rendered SQL. */
  const locks: string[] = [];
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      writes.push({ action: "delete", row, table });
      tables[table] = (tables[table] ?? []).filter((r) => r.id !== row.id);
    },
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
  const tx = {
    dbTransaction: {
      wrappedTransaction: {
        execute: async (query: { queryChunks?: unknown[] }) => {
          locks.push(
            (query.queryChunks ?? [])
              .map((chunk) =>
                typeof chunk === "object" && chunk && "value" in chunk
                  ? (chunk as { value: string[] }).value.join("")
                  : String(chunk)
              )
              .join("?")
          );
        },
      },
    },
    location,
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

async function run(
  mutator: { fn: (input: never) => Promise<void> },
  db: ReturnType<typeof createDb>,
  ctx: Row | undefined,
  args: Row
) {
  return await mutator.fn({ args, ctx, tx: db.tx } as never);
}

const donorsCtx = {
  permissions: ["donors.view", "donors.manage"],
  role: "finance_admin",
  userId: "fin-1",
};
const financeCtx = {
  permissions: ["finance.view", "finance.manage"],
  role: "finance_admin",
  userId: "fin-1",
};
const viewerCtx = {
  permissions: ["donors.view", "finance.view"],
  role: "admin",
  userId: "adm-1",
};

function contribution(overrides: Row = {}): Row {
  return {
    amountPaise: 500_000,
    channel: "upi",
    donationType: "voluntary",
    fundId: "fund-1",
    id: "c-1",
    orgAccountId: "acc-1",
    partyId: "donor-1",
    receivedOn: "2026-10-01",
    reference: " UTR123 ",
    reportingMode: "electronic_or_account_payee",
    ...overrides,
  };
}

function parse(args: Row) {
  return contributionInputSchema.safeParse(args);
}

describe("contribution input validation", () => {
  it("accepts an ordinary gift", () => {
    expect(parse(contribution()).success).toBe(true);
  });

  it("refuses zero, fractional and future amounts or dates", () => {
    expect(parse(contribution({ amountPaise: 0 })).success).toBe(false);
    expect(parse(contribution({ amountPaise: 10.5 })).success).toBe(false);
    expect(parse(contribution({ receivedOn: "2999-01-01" })).success).toBe(
      false
    );
  });

  it("requires the deposit account unless the gift is in kind", () => {
    const result = parse(contribution({ orgAccountId: null }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["orgAccountId"]);
    expect(
      parse(
        contribution({
          channel: "in_kind",
          inKindDescription: "Laptops",
          inKindValuationBasis: "Invoice",
          orgAccountId: null,
          reportingMode: "in_kind",
        })
      ).success
    ).toBe(true);
  });

  it("requires a description for other donation types and reporting modes", () => {
    const result = parse(
      contribution({ donationType: "other", reportingMode: "other" })
    );
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      "reportingModeDescription",
      "donationTypeDescription",
    ]);
  });
});

describe("contribution mutators", () => {
  it("refuses callers without donors.manage", async () => {
    const db = createDb();
    for (const ctx of [viewerCtx, financeCtx, undefined]) {
      await expect(
        run(contributionMutators.create, db, ctx, contribution())
      ).rejects.toThrow("Unauthorized");
    }
    expect(db.writes).toEqual([]);
  });

  it("records a manual received gift with trimmed text", async () => {
    const db = createDb();
    await run(contributionMutators.create, db, donorsCtx, contribution());
    const [write] = db.writes;
    expect(write?.table).toBe("contribution");
    expect(write?.row).toMatchObject({
      amountPaise: 500_000,
      createdBy: "fin-1",
      currency: "INR",
      deductionEligible: "unknown",
      orgAccountId: "acc-1",
      programmeId: null,
      receivedOn: Date.UTC(2026, 9, 1),
      reference: "UTR123",
      source: "manual",
      status: "received",
    });
  });

  it("refuses a party without an active giver role", async () => {
    const db = createDb();
    for (const partyId of ["lapsed-1", "vendor-1", "missing"]) {
      await expect(
        run(
          contributionMutators.create,
          db,
          donorsCtx,
          contribution({ partyId })
        )
      ).rejects.toThrow(
        "Pick a party with an active donor, sponsor, grantor or intermediary role"
      );
    }
  });

  it("refuses GiveIndia as a giver, naming the person to record instead", async () => {
    await expect(
      run(
        contributionMutators.create,
        createDb(),
        donorsCtx,
        contribution({ partyId: GIVE_INDIA_PARTY_ID })
      )
    ).rejects.toThrow(
      "GiveIndia is a donation platform, not a donor. Record the person who gave."
    );
  });

  it("accepts sponsors, grantors and intermediaries as givers", async () => {
    const db = createDb();
    for (const partyId of ["sponsor-1", "grantor-1", "goodera-1"]) {
      await run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ id: `c-${partyId}`, partyId })
      );
    }
    expect(db.tables.contribution?.map((c) => c.partyId)).toEqual([
      "sponsor-1",
      "grantor-1",
      "goodera-1",
    ]);
  });

  it("refuses inactive or missing accounts and funds", async () => {
    const db = createDb();
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ orgAccountId: "acc-old" })
      )
    ).rejects.toThrow("Account is not active");
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ fundId: "fund-x" })
      )
    ).rejects.toThrow("Fund not found");
  });

  it("takes the programme from the project and refuses a mismatch", async () => {
    const db = createDb();
    await run(
      contributionMutators.create,
      db,
      donorsCtx,
      contribution({ projectId: "proj-k3" })
    );
    expect(db.writes[0]?.row.programmeId).toBe("prog-arts");
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({
          id: "c-2",
          programmeId: "prog-edu",
          projectId: "proj-k3",
        })
      )
    ).rejects.toThrow("The project belongs to a different programme");
  });

  it("refuses the Unallocated programme on create and update", async () => {
    const db = createDb();
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ programmeId: PROGRAMME_IDS.unallocated })
      )
    ).rejects.toThrow("not the Unallocated holder");
    await run(contributionMutators.create, db, donorsCtx, contribution());
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ programmeId: PROGRAMME_IDS.unallocated })
      )
    ).rejects.toThrow("not the Unallocated holder");
  });

  it("drops fields the channel, mode and type do not use", async () => {
    const db = createDb();
    await run(
      contributionMutators.create,
      db,
      donorsCtx,
      contribution({
        donationTypeDescription: "stale",
        inKindDescription: "stale",
        reportingModeDescription: "stale",
      })
    );
    expect(db.writes[0]?.row).toMatchObject({
      donationTypeDescription: null,
      inKindDescription: null,
      reportingModeDescription: null,
    });
  });

  it("edits and deletes only pending or received contributions", async () => {
    const db = createDb({
      contribution: [
        {
          id: "c-1",
          partyId: "donor-1",
          fundId: "fund-1",
          orgAccountId: "acc-1",
          programmeId: null,
          status: "received",
        },
        {
          id: "c-9",
          partyId: "donor-1",
          fundId: "fund-1",
          orgAccountId: "acc-1",
          programmeId: null,
          status: "receipted",
        },
      ],
    });
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ amountPaise: 700_000 })
    );
    expect(db.tables.contribution?.[0]?.amountPaise).toBe(700_000);
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ id: "c-9" })
      )
    ).rejects.toThrow("Only pending or received contributions can be changed");
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-9" })
    ).rejects.toThrow("Only pending or received contributions can be changed");
    await run(contributionMutators.delete, db, donorsCtx, { id: "c-1" });
    expect(db.tables.contribution?.map((c) => c.id)).toEqual(["c-9"]);
  });

  it("locks the contribution, and with a refund keeps what the provider reported", async () => {
    const recorded = {
      amountPaise: 500_000,
      channel: "upi",
      fundId: "fund-1",
      id: "c-1",
      orgAccountId: "acc-1",
      partyId: "donor-1",
      programmeId: null,
      receivedOn: Date.UTC(2026, 9, 1),
      status: "received",
    };
    const db = createDb({
      contribution: [recorded],
      contributionRefund: [
        { amountPaise: 100_000, contributionId: "c-1", id: "r-1" },
      ],
      fund: [
        { active: true, id: "fund-1" },
        { active: true, id: "fund-2" },
      ],
    });
    // Classification still changes: programme, fund, notes.
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({
        fundId: "fund-2",
        notes: "Recurring",
        programmeId: "prog-edu",
      })
    );
    expect(db.tables.contribution?.[0]).toMatchObject({
      amountPaise: 500_000,
      fundId: "fund-2",
      notes: "Recurring",
      programmeId: "prog-edu",
    });
    expect(db.locks[0]).toContain("for update");

    for (const change of [
      { amountPaise: 400_000 },
      { partyId: "sponsor-1" },
      { receivedOn: "2026-10-02" },
      { channel: "neft", reportingMode: "electronic_or_account_payee" },
      { orgAccountId: "acc-2" },
    ]) {
      await expect(
        run(contributionMutators.update, db, donorsCtx, contribution(change))
      ).rejects.toThrow("refund is recorded");
    }
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-1" })
    ).rejects.toThrow("can't be deleted");
    expect(db.tables.contribution).toHaveLength(1);
  });

  it("keeps what Razorpay reported once a processed settlement paid the gift out", async () => {
    const recorded = {
      amountPaise: 500_000,
      channel: "razorpay",
      fundId: "fund-1",
      id: "c-1",
      orgAccountId: "acc-1",
      partyId: "donor-1",
      programmeId: null,
      receivedOn: Date.UTC(2026, 9, 1),
      status: "received",
    };
    const line = {
      contributionId: "c-1",
      id: "line-1",
      settlementId: "s-1",
      type: "payment",
    };
    // A settlement not processed yet locks nothing.
    const pending = createDb({
      contribution: [{ ...recorded }],
      gatewaySettlement: [{ id: "s-1", status: "created" }],
      gatewaySettlementItem: [line],
    });
    await run(
      contributionMutators.update,
      pending,
      donorsCtx,
      contribution({ amountPaise: 400_000, channel: "razorpay" })
    );
    expect(pending.tables.contribution?.[0]?.amountPaise).toBe(400_000);

    const db = createDb({
      contribution: [{ ...recorded }],
      fund: [
        { active: true, id: "fund-1" },
        { active: true, id: "fund-2" },
      ],
      gatewaySettlement: [{ id: "s-1", status: "processed" }],
      gatewaySettlementItem: [line],
    });
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ channel: "razorpay", fundId: "fund-2", notes: "Kept" })
    );
    expect(db.tables.contribution?.[0]).toMatchObject({
      fundId: "fund-2",
      notes: "Kept",
    });
    for (const change of [
      { amountPaise: 400_000 },
      { partyId: "sponsor-1" },
      { receivedOn: "2026-10-02" },
      { channel: "upi" },
      { orgAccountId: "acc-2" },
    ]) {
      await expect(
        run(
          contributionMutators.update,
          db,
          donorsCtx,
          contribution({ channel: "razorpay", ...change })
        )
      ).rejects.toThrow("Razorpay has settled");
    }
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-1" })
    ).rejects.toThrow("can't be deleted");
    expect(db.tables.contribution).toHaveLength(1);
  });

  it("keeps a since-retired account on an edit that does not change it", async () => {
    const db = createDb({
      contribution: [
        {
          id: "c-1",
          partyId: "donor-1",
          fundId: "fund-1",
          orgAccountId: "acc-old",
          programmeId: null,
          status: "received",
        },
      ],
    });
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ orgAccountId: "acc-old" })
    );
    expect(db.tables.contribution?.[0]?.orgAccountId).toBe("acc-old");
  });

  it("skips server-only reference checks in the optimistic client run", async () => {
    const db = createDb({ partyRole: [] }, "client");
    await run(contributionMutators.create, db, donorsCtx, contribution());
    expect(db.writes).toHaveLength(1);
  });
});

describe("other income mutators", () => {
  const income = (overrides: Row = {}): Row => ({
    amountPaise: 12_345,
    description: "  Savings interest Q2 ",
    fundId: "fund-1",
    id: "oi-1",
    kind: "interest",
    orgAccountId: "acc-1",
    receivedOn: "2026-09-30",
    ...overrides,
  });

  it("needs finance.manage", async () => {
    const db = createDb();
    await expect(
      run(otherIncomeMutators.create, db, donorsCtx, income())
    ).rejects.toThrow("Unauthorized");
  });

  it("creates, updates and deletes", async () => {
    const db = createDb();
    await run(otherIncomeMutators.create, db, financeCtx, income());
    expect(db.tables.otherIncome?.[0]).toMatchObject({
      createdBy: "fin-1",
      description: "Savings interest Q2",
      receivedOn: Date.UTC(2026, 8, 30),
    });
    await run(
      otherIncomeMutators.update,
      db,
      financeCtx,
      income({ amountPaise: 20_000, kind: "misc" })
    );
    expect(db.tables.otherIncome?.[0]).toMatchObject({
      amountPaise: 20_000,
      kind: "misc",
    });
    await run(otherIncomeMutators.delete, db, financeCtx, { id: "oi-1" });
    expect(db.tables.otherIncome).toEqual([]);
  });

  it("refuses an inactive account", async () => {
    const db = createDb();
    await expect(
      run(
        otherIncomeMutators.create,
        db,
        financeCtx,
        income({ orgAccountId: "acc-old" })
      )
    ).rejects.toThrow("Account is not active");
  });
});

describe("recording a donation from a bank statement line", () => {
  const bothCtx = {
    permissions: ["donors.manage", "finance.manage"],
    role: "finance_admin",
    userId: "fin-1",
  };
  const statementLine = (overrides: Row = {}): Row => ({
    amountPaise: 500_000,
    direction: "credit",
    id: "line-1",
    matchStatus: "unmatched",
    orgAccountId: "acc-1",
    ...overrides,
  });

  it("needs finance.manage as well as donors.manage", async () => {
    const db = createDb({ statementLine: [statementLine()] });
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ statementLineId: "line-1" })
      )
    ).rejects.toThrow("Unauthorized");
    expect(db.writes).toEqual([]);
  });

  it("matches the line to the new contribution in the same transaction", async () => {
    const db = createDb({ statementLine: [statementLine()] });
    await run(
      contributionMutators.create,
      db,
      bothCtx,
      contribution({ statementLineId: "line-1" })
    );
    expect(db.writes.map((w) => w.table)).toEqual([
      "contribution",
      "statementLine",
    ]);
    expect(db.tables.statementLine?.[0]).toMatchObject({
      matchedBy: "fin-1",
      matchedContributionId: "c-1",
      matchKind: "contribution",
      matchReason: "manual",
      matchStatus: "matched",
    });
    expect(db.locks.some((lock) => lock.includes("statement-line-match"))).toBe(
      true
    );
  });

  it("refuses another amount or account, a matched line or a gateway channel", async () => {
    for (const [line, args] of [
      [statementLine({ amountPaise: 1 }), {}],
      [statementLine({ orgAccountId: "acc-old" }), {}],
      [statementLine({ matchStatus: "matched" }), {}],
      [statementLine({ direction: "debit" }), {}],
      [statementLine(), { channel: "razorpay" }],
    ] as [Row, Row][]) {
      const db = createDb({ statementLine: [line] });
      await expect(
        run(
          contributionMutators.create,
          db,
          bothCtx,
          contribution({ statementLineId: "line-1", ...args })
        )
      ).rejects.toThrow();
      expect(db.writes).toEqual([]);
    }
  });

  it("keeps a matched contribution from being deleted or changing amount", async () => {
    const seed = {
      contribution: [{ ...contribution(), status: "received" }],
      statementLine: [
        statementLine({
          matchedContributionId: "c-1",
          matchStatus: "matched",
        }),
      ],
    };
    const db = createDb(seed);
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-1" })
    ).rejects.toThrow("Unmatch the line first");
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ amountPaise: 600_000 })
      )
    ).rejects.toThrow("Unmatch the line first");
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ channel: "razorpay" })
      )
    ).rejects.toThrow("Unmatch the line first");
    expect(db.locks.some((lock) => lock.includes("statement-line-match"))).toBe(
      true
    );
    // Other fields still change.
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ notes: "thanks" })
    );
    expect(db.writes.at(-1)?.table).toBe("contribution");
  });
});
