import { describe, expect, it } from "bun:test";

import {
  CORPUS_FUND_ID,
  GIVE_INDIA_PARTY_ID,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";

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
    appConfig: [{ key: "razorpay_clearing_account_id", value: "acc-rzp" }],
    contribution: [],
    contributionRefund: [],
    fund: [
      { active: true, id: "fund-1" },
      { active: true, id: CORPUS_FUND_ID },
    ],
    gatewaySettlement: [],
    gatewaySettlementItem: [],
    orgAccount: [
      { active: true, id: "acc-1", kind: "bank" },
      { active: false, id: "acc-old", kind: "bank" },
      { active: true, id: "acc-2", kind: "bank" },
      { active: true, id: "acc-cash", kind: "cash" },
      { active: true, id: "acc-rzp", kind: "gateway_clearing" },
      { active: true, id: "acc-gd", kind: "gateway_clearing" },
      { active: true, id: "acc-fd", kind: "deposit" },
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
          const rendered = (query.queryChunks ?? [])
            .map((chunk) =>
              typeof chunk === "object" && chunk && "value" in chunk
                ? (chunk as { value: string[] }).value.join("")
                : String(chunk)
            )
            .join("?");
          // The filed-gift check reads the private filing links.
          if (rendered.includes("donation_filing_gift")) {
            return (tables.donationFilingGift ?? []).filter((row) =>
              rendered.includes(String(row.contributionId))
            );
          }
          locks.push(rendered);
          return [];
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
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row | undefined,
  args: Row
) {
  return await mutator.fn({ args, ctx, tx: db.tx } as never);
}

const donorsCtx = {
  enqueue: async () => "job",
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

/** A Razorpay gift lands in the Razorpay clearing account. */
const RAZORPAY_GIFT = { channel: "razorpay", orgAccountId: "acc-rzp" };

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
      contribution({
        channel: "cheque",
        donationType: "other",
        reportingMode: "other",
      })
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

  it("puts the gift in the account its channel allows", async () => {
    const db = createDb();
    const refused: [Row, string][] = [
      [{ orgAccountId: "acc-rzp" }, "A UPI gift goes into a bank account"],
      [
        { channel: "neft", orgAccountId: "acc-cash" },
        "A NEFT/IMPS gift goes into a bank account",
      ],
      [
        { channel: "razorpay", orgAccountId: "acc-1" },
        "A Razorpay gift goes into the Razorpay clearing account",
      ],
      [
        { channel: "give_do", orgAccountId: "acc-rzp" },
        "A give.do gift goes into the give.do clearing account",
      ],
      [
        { channel: "cash", orgAccountId: "acc-gd", reportingMode: "cash" },
        "A cash gift goes into a bank or cash account",
      ],
    ];
    for (const [change, message] of refused) {
      await expect(
        run(contributionMutators.create, db, donorsCtx, contribution(change))
      ).rejects.toThrow(message);
    }
    expect(db.writes).toEqual([]);
    for (const [index, change] of [
      RAZORPAY_GIFT,
      { channel: "give_do", orgAccountId: "acc-gd" },
      { channel: "cash", orgAccountId: "acc-cash", reportingMode: "cash" },
      { channel: "cash", orgAccountId: "acc-1", reportingMode: "cash" },
      { channel: "cheque", orgAccountId: "acc-2" },
    ].entries()) {
      await run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ ...change, id: `c-ok-${index}` })
      );
    }
    expect(db.tables.contribution).toHaveLength(5);
  });

  it("refuses a Razorpay gift until the clearing account is chosen", async () => {
    await expect(
      run(
        contributionMutators.create,
        createDb({ appConfig: [] }),
        donorsCtx,
        contribution(RAZORPAY_GIFT)
      )
    ).rejects.toThrow("Choose the Razorpay clearing account in Settings first");
  });

  it("refuses a reporting mode the channel rules out", () => {
    const upi = parse(
      contribution({ reportingMode: "other", reportingModeDescription: "DD" })
    );
    expect(upi.error?.issues.map((i) => i.message)).toEqual([
      "A UPI gift is reported as electronic or account-payee cheque",
    ]);
    expect(
      parse(
        contribution({
          channel: "cheque",
          reportingMode: "other",
          reportingModeDescription: "Bearer cheque",
        })
      ).success
    ).toBe(true);
    expect(
      parse(contribution({ channel: "cheque", reportingMode: "cash" })).success
    ).toBe(false);
  });

  it("holds an edit to the channel rules, except an account a refund fixed", async () => {
    const recorded = {
      amountPaise: 500_000,
      channel: "razorpay",
      fundId: "fund-1",
      id: "c-1",
      // Recorded before the rules, into a bank account.
      orgAccountId: "acc-1",
      partyId: "donor-1",
      programmeId: null,
      receivedOn: Date.UTC(2026, 9, 1),
      status: "received",
    };
    const open = createDb({ contribution: [{ ...recorded }] });
    await expect(
      run(
        contributionMutators.update,
        open,
        donorsCtx,
        contribution({ channel: "razorpay", notes: "Edited" })
      )
    ).rejects.toThrow(
      "A Razorpay gift goes into the Razorpay clearing account"
    );
    await run(
      contributionMutators.update,
      open,
      donorsCtx,
      contribution({ ...RAZORPAY_GIFT, notes: "Edited" })
    );
    expect(open.tables.contribution?.[0]?.orgAccountId).toBe("acc-rzp");

    // A refund fixes the channel and account, so they cannot be put right;
    // classification edits still save.
    const refunded = createDb({
      contribution: [{ ...recorded }],
      contributionRefund: [
        { amountPaise: 100_000, contributionId: "c-1", id: "r-1" },
      ],
    });
    await run(
      contributionMutators.update,
      refunded,
      donorsCtx,
      contribution({ channel: "razorpay", notes: "Edited" })
    );
    expect(refunded.tables.contribution?.[0]?.notes).toBe("Edited");
  });

  it("names the programme of a grant or CSR gift, and none for corpus", async () => {
    const db = createDb();
    for (const [change, message] of [
      [
        { donationType: "specific_grant" },
        "A specific grant needs the programme it's for",
      ],
      [{ donationType: "csr" }, "A CSR gift needs the programme it's for"],
      [
        {
          donationType: "corpus",
          fundId: CORPUS_FUND_ID,
          programmeId: "prog-edu",
        },
        "A corpus gift has no programme",
      ],
      [
        {
          donationType: "corpus",
          fundId: CORPUS_FUND_ID,
          projectId: "proj-k3",
        },
        "A corpus gift has no programme",
      ],
    ] as const) {
      await expect(
        run(contributionMutators.create, db, donorsCtx, contribution(change))
      ).rejects.toThrow(message);
    }
    expect(db.writes).toEqual([]);
    await run(
      contributionMutators.create,
      db,
      donorsCtx,
      contribution({ donationType: "specific_grant", programmeId: "prog-edu" })
    );
    // A project sets the programme.
    await run(
      contributionMutators.create,
      db,
      donorsCtx,
      contribution({ donationType: "csr", id: "c-2", projectId: "proj-k3" })
    );
    await run(
      contributionMutators.create,
      db,
      donorsCtx,
      contribution({
        donationType: "corpus",
        fundId: CORPUS_FUND_ID,
        id: "c-3",
      })
    );
    expect(db.tables.contribution?.map((c) => c.programmeId)).toEqual([
      "prog-edu",
      "prog-arts",
      null,
    ]);
  });

  it("books a corpus gift to the Corpus Fund, and only a corpus gift", async () => {
    const db = createDb();
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ donationType: "corpus" })
      )
    ).rejects.toThrow("A corpus gift goes to the Corpus Fund");
    await expect(
      run(
        contributionMutators.create,
        db,
        donorsCtx,
        contribution({ fundId: CORPUS_FUND_ID })
      )
    ).rejects.toThrow("Only a corpus gift goes to the Corpus Fund");
    expect(db.writes).toEqual([]);
    await run(
      contributionMutators.create,
      db,
      donorsCtx,
      contribution({ donationType: "corpus", fundId: CORPUS_FUND_ID })
    );
    expect(db.tables.contribution?.[0]?.fundId).toBe(CORPUS_FUND_ID);
    // Its fund can't be changed while it is a corpus gift.
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ donationType: "corpus", fundId: "fund-1" })
      )
    ).rejects.toThrow("A corpus gift goes to the Corpus Fund");
  });

  it("holds a corpus gift recorded against another fund to the rule when edited", async () => {
    const db = createDb({
      contribution: [
        {
          donationType: "corpus",
          fundId: "fund-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "donor-1",
          programmeId: null,
          status: "received",
        },
      ],
    });
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ donationType: "corpus", notes: "Edited" })
      )
    ).rejects.toThrow("A corpus gift goes to the Corpus Fund");
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ donationType: "corpus", fundId: CORPUS_FUND_ID })
    );
    expect(db.tables.contribution?.[0]?.fundId).toBe(CORPUS_FUND_ID);
  });

  it("holds an edited legacy grant to the rule until it names a programme", async () => {
    const db = createDb({
      contribution: [
        {
          donationType: "specific_grant",
          fundId: "fund-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "donor-1",
          programmeId: null,
          status: "received",
        },
      ],
    });
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ donationType: "specific_grant", notes: "Edited" })
      )
    ).rejects.toThrow("A specific grant needs the programme it's for");
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ donationType: "specific_grant", programmeId: "prog-edu" })
    );
    expect(db.tables.contribution?.[0]?.programmeId).toBe("prog-edu");
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

  it("keeps the donor and project of a gift that counts towards a grant", async () => {
    const db = createDb({
      contribution: [
        {
          fundId: "fund-1",
          grantId: "grant-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "grantor-1",
          programmeId: "prog-arts",
          projectId: "proj-k3",
          status: "received",
        },
      ],
    });
    const linked = { partyId: "grantor-1", projectId: "proj-k3" };
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ ...linked, partyId: "donor-1" })
      )
    ).rejects.toThrow("Ask finance to unlink it from the grant first");
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({ ...linked, projectId: null })
      )
    ).rejects.toThrow("Ask finance to unlink it from the grant first");
    await expect(
      run(
        contributionMutators.update,
        db,
        donorsCtx,
        contribution({
          ...linked,
          channel: "in_kind",
          inKindDescription: "Books",
          inKindValuationBasis: "Invoice",
          orgAccountId: null,
          reportingMode: "in_kind",
        })
      )
    ).rejects.toThrow("not in-kind gifts");
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ ...linked, amountPaise: 600_000 })
    );
    expect(db.tables.contribution?.[0]?.amountPaise).toBe(600_000);
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

  it("refuses to delete a gift a receipt was issued for, even a voided one", async () => {
    const db = createDb({
      contribution: [
        {
          fundId: "fund-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "donor-1",
          programmeId: null,
          status: "received",
        },
      ],
      contributionReceipt: [
        {
          contributionId: "c-1",
          id: "r-1",
          number: "PI/2026-27/0001",
          voidedAt: 1_800_000_000_000,
        },
      ],
    });
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-1" })
    ).rejects.toThrow(
      "A receipt was issued for this gift; it can't be deleted"
    );
    expect(db.tables.contribution).toHaveLength(1);
  });

  it("refuses to delete a gift in a donations return filing", async () => {
    const db = createDb({
      contribution: [
        {
          fundId: "fund-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "donor-1",
          programmeId: null,
          status: "received",
        },
      ],
      donationFilingGift: [
        { contributionId: "c-1", sequence: 1, status: "prepared" },
      ],
    });
    // Not uploaded yet: discard the filing first.
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-1" })
    ).rejects.toThrow("Discard that filing first");
    expect(db.tables.contribution).toHaveLength(1);
  });

  it("keeps what a donations return filing reported about a filed gift", async () => {
    const db = createDb({
      contribution: [
        {
          amountPaise: 500_000,
          channel: "upi",
          deductionEligible: "unknown",
          donationType: "voluntary",
          fundId: "fund-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "donor-1",
          programmeId: null,
          receivedOn: Date.UTC(2026, 9, 1),
          reportingMode: "electronic_or_account_payee",
          status: "received",
        },
      ],
      donationFilingGift: [
        { contributionId: "c-1", sequence: 2, status: "submitted" },
      ],
    });
    // Notes and classification still change.
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ notes: "Filed" })
    );
    expect(db.tables.contribution?.[0]?.notes).toBe("Filed");
    for (const change of [
      { amountPaise: 400_000 },
      { partyId: "sponsor-1" },
      { receivedOn: "2026-10-02" },
      { channel: "neft" },
      { reportingMode: "other" },
      { deductionEligible: "no", eligibilityReason: "Not a donation" },
      { donationType: "corpus" },
    ]) {
      await expect(
        run(contributionMutators.update, db, donorsCtx, contribution(change))
      ).rejects.toThrow("in donations return filing 2");
    }
  });

  it("keeps what a live receipt printed until it is voided", async () => {
    const gift = {
      amountPaise: 500_000,
      channel: "upi",
      deductionEligible: "unknown",
      donationType: "voluntary",
      fundId: "fund-1",
      id: "c-1",
      orgAccountId: "acc-1",
      partyId: "donor-1",
      programmeId: null,
      receivedOn: Date.UTC(2026, 9, 1),
      // Stored with stray spaces; the form sends it trimmed.
      reference: " UTR123 ",
      reportingMode: "electronic_or_account_payee",
      status: "received",
    };
    const receipt = {
      contributionId: "c-1",
      id: "r-1",
      number: "PI/2026-27/0001",
      voidedAt: null,
    };
    const db = createDb({
      contribution: [gift],
      contributionReceipt: [receipt],
    });
    // Notes still change, without the stored spacing tripping the lock.
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ notes: "Thanked" })
    );
    expect(db.tables.contribution?.[0]?.notes).toBe("Thanked");
    for (const change of [
      { programmeId: "prog-edu" },
      { partyId: "sponsor-1" },
      { amountPaise: 400_000 },
      { receivedOn: "2026-10-02" },
      { channel: "neft" },
      { reportingMode: "other" },
      { deductionEligible: "no", eligibilityReason: "Not a donation" },
      { donationType: "corpus" },
      { reference: "UTR999" },
    ]) {
      await expect(
        run(contributionMutators.update, db, donorsCtx, contribution(change))
      ).rejects.toThrow("Void the receipt first.");
    }
    expect(db.tables.contribution?.[0]?.partyId).toBe("donor-1");

    // A voided receipt no longer holds the gift.
    const voided = createDb({
      contribution: [gift],
      contributionReceipt: [{ ...receipt, voidedAt: 1_800_000_000_000 }],
    });
    await run(
      contributionMutators.update,
      voided,
      donorsCtx,
      contribution({ partyId: "sponsor-1" })
    );
    expect(voided.tables.contribution?.[0]?.partyId).toBe("sponsor-1");
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
    // The statement line lock first, then the contribution row.
    expect(db.locks[0]).toContain("statement-line-match");
    expect(db.locks[1]).toContain("for update");

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
      orgAccountId: "acc-rzp",
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
      contribution({ amountPaise: 400_000, ...RAZORPAY_GIFT })
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
      contribution({ ...RAZORPAY_GIFT, fundId: "fund-2", notes: "Kept" })
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
          contribution({ ...RAZORPAY_GIFT, ...change })
        )
      ).rejects.toThrow("Razorpay has settled");
    }
    await expect(
      run(contributionMutators.delete, db, donorsCtx, { id: "c-1" })
    ).rejects.toThrow("can't be deleted");
    expect(db.tables.contribution).toHaveLength(1);
    // The tax certificate choice is classification, so it stays editable.
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({
        ...RAZORPAY_GIFT,
        deductionEligible: "no",
        eligibilityReason: "Donor declined",
        fundId: "fund-2",
        notes: "Kept",
      })
    );
    expect(db.tables.contribution?.[0]).toMatchObject({
      deductionEligible: "no",
      eligibilityReason: "Donor declined",
    });
  });

  it("stores the tax certificate choice and requires a reason to exclude", async () => {
    expect(parse(contribution({ deductionEligible: "no" })).success).toBe(
      false
    );
    const db = createDb();
    await run(contributionMutators.create, db, donorsCtx, contribution());
    expect(db.tables.contribution?.[0]).toMatchObject({
      deductionEligible: "unknown",
      eligibilityReason: null,
    });
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({
        deductionEligible: "no",
        eligibilityReason: " Not a donation ",
      })
    );
    expect(db.tables.contribution?.[0]).toMatchObject({
      deductionEligible: "no",
      eligibilityReason: "Not a donation",
    });
    // Left out, an update keeps the stored choice.
    await run(contributionMutators.update, db, donorsCtx, contribution());
    expect(db.tables.contribution?.[0]).toMatchObject({
      deductionEligible: "no",
      eligibilityReason: "Not a donation",
    });
    // Include drops a stale reason.
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({ deductionEligible: "yes", eligibilityReason: "old" })
    );
    expect(db.tables.contribution?.[0]).toMatchObject({
      deductionEligible: "yes",
      eligibilityReason: null,
    });
  });

  it("lets the tax certificate choice change on a refunded import", async () => {
    const db = createDb({
      contribution: [
        {
          amountPaise: 500_000,
          channel: "upi",
          deductionEligible: "unknown",
          eligibilityReason: null,
          fundId: "fund-1",
          id: "c-1",
          orgAccountId: "acc-1",
          partyId: "donor-1",
          programmeId: null,
          receivedOn: Date.UTC(2026, 9, 1),
          source: "import",
          status: "received",
        },
      ],
      contributionRefund: [
        { amountPaise: 100_000, contributionId: "c-1", id: "r-1" },
      ],
    });
    await run(
      contributionMutators.update,
      db,
      donorsCtx,
      contribution({
        deductionEligible: "no",
        eligibilityReason: "Donor declined",
      })
    );
    expect(db.tables.contribution?.[0]).toMatchObject({
      deductionEligible: "no",
      eligibilityReason: "Donor declined",
    });
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
    enqueue: async () => "job",
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
    // The statement line lock comes before the contribution row lock, as
    // matching takes them, so the two never deadlock.
    const order = db.locks.map((lock) =>
      lock.includes("statement-line-match")
        ? "lines"
        : lock.includes("for update")
          ? "row"
          : "other"
    );
    expect(order.slice(0, 2)).toEqual(["lines", "row"]);
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

describe("queueing the books after a change", () => {
  const withQueue = (base: Row) => {
    const sent: unknown[][] = [];
    const ctx = {
      ...base,
      asyncTasks: [] as { fn: () => Promise<void>; meta: Row }[],
      enqueue: async (...args: unknown[]) => {
        sent.push(args);
        return "job";
      },
      traceId: "trace-1",
    };
    return { ctx, sent };
  };

  it("queues the posting of a gift after it is recorded, changed or deleted", async () => {
    const db = createDb();
    const { ctx, sent } = withQueue(donorsCtx);
    await run(contributionMutators.create, db, ctx, contribution());
    await run(
      contributionMutators.update,
      db,
      ctx,
      contribution({ programmeId: "prog-edu" })
    );
    await run(contributionMutators.delete, db, ctx, { id: "c-1" });
    expect(ctx.asyncTasks.map((task) => task.meta.mutator)).toEqual([
      "contribution.create",
      "contribution.update",
      "contribution.delete",
    ]);
    // Receipt creation is durable in the donation transaction; books follow commit.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject([
      "issue-contribution-receipt",
      { actorId: "fin-1", contributionId: "c-1" },
      { singletonKey: "c-1", traceId: "trace-1" },
    ]);
    expect(sent[0]?.[2]).toHaveProperty("db");
    for (const task of ctx.asyncTasks) {
      await task.fn();
    }
    expect(sent[1]).toEqual([
      "ledger-post-source",
      { sourceId: "c-1", sourceType: "contribution" },
      { singletonKey: "contribution:c-1", traceId: "trace-1" },
    ]);
    expect(sent).toHaveLength(4);
  });

  it("queues the posting of other income", async () => {
    const db = createDb();
    const { ctx, sent } = withQueue(financeCtx);
    await run(otherIncomeMutators.create, db, ctx, {
      amountPaise: 12_345,
      fundId: "fund-1",
      id: "oi-1",
      kind: "interest",
      orgAccountId: "acc-1",
      receivedOn: "2026-09-30",
    });
    for (const task of ctx.asyncTasks) {
      await task.fn();
    }
    expect(sent).toEqual([
      [
        "ledger-post-source",
        { sourceId: "oi-1", sourceType: "other_income" },
        { singletonKey: "other_income:oi-1", traceId: "trace-1" },
      ],
    ]);
  });

  it("doesn't queue automatic receipts for gateway, in-kind or pre-start gifts", async () => {
    for (const overrides of [
      RAZORPAY_GIFT,
      { channel: "give_do", orgAccountId: "acc-gd" },
      {
        channel: "in_kind",
        orgAccountId: null,
        inKindDescription: "Books",
        inKindValuationBasis: "Cost",
      },
      { receivedOn: "2026-03-31" },
    ]) {
      const db = createDb();
      const { ctx, sent } = withQueue(donorsCtx);
      await run(contributionMutators.create, db, ctx, contribution(overrides));
      expect(sent).toEqual([]);
    }
  });

  it("fails the transaction if the receipt job cannot be stored", async () => {
    const db = createDb();
    await expect(
      run(
        contributionMutators.create,
        db,
        {
          ...donorsCtx,
          enqueue: async () => {
            throw new Error("queue unavailable");
          },
        },
        contribution()
      )
    ).rejects.toThrow("queue unavailable");
  });

  it("queues nothing from the client's optimistic run", async () => {
    const db = createDb({}, "client");
    const { ctx } = withQueue(donorsCtx);
    await run(contributionMutators.create, db, ctx, contribution());
    expect(ctx.asyncTasks).toEqual([]);
  });
});
