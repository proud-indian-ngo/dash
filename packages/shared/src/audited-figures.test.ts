import { describe, expect, it } from "vitest";

import {
  auditedDrift,
  auditedLineKey,
  booksChangedSince,
  buildAuditedPayload,
  type AuditedLineInput,
  balanceSheetLines,
  type BalanceSheetLine,
  planAuditedFigures,
} from "./audited-figures";
import {
  CORPUS_FUND_ID,
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "./constants";
import { surplusPaiseOf } from "./ledger";

const H = LEDGER_ACCOUNT_HEAD_IDS;
const BANK = "bank-1";
const FD = "fd-1";

/** Fake books at 31 March: bank 4,000, FD 7,000, two assets, one liability, two funds. */
const BOOKS: BalanceSheetLine[] = [
  {
    accountHeadId: null,
    booksPaise: 4000_00,
    fundId: null,
    key: auditedLineKey({ kind: "account", orgAccountId: BANK }),
    kind: "account",
    memo: null,
    orgAccountId: BANK,
  },
  {
    accountHeadId: null,
    booksPaise: 7000_00,
    fundId: null,
    key: auditedLineKey({ kind: "account", orgAccountId: FD }),
    kind: "account",
    memo: null,
    orgAccountId: FD,
  },
  {
    accountHeadId: H.fixedAssets,
    booksPaise: 400_00,
    fundId: null,
    key: auditedLineKey({
      accountHeadId: H.fixedAssets,
      kind: "asset",
      memo: "Sewing machine",
    }),
    kind: "asset",
    memo: "Sewing machine",
    orgAccountId: null,
  },
  {
    accountHeadId: H.supplierAdvances,
    booksPaise: 50_00,
    fundId: null,
    key: auditedLineKey({ accountHeadId: H.supplierAdvances, kind: "asset" }),
    kind: "asset",
    memo: null,
    orgAccountId: null,
  },
  {
    accountHeadId: H.auditFeesPayable,
    booksPaise: 100_00,
    fundId: null,
    key: auditedLineKey({
      accountHeadId: H.auditFeesPayable,
      kind: "liability",
    }),
    kind: "liability",
    memo: null,
    orgAccountId: null,
  },
  {
    accountHeadId: null,
    booksPaise: 100_00,
    fundId: CORPUS_FUND_ID,
    key: auditedLineKey({ fundId: CORPUS_FUND_ID, kind: "fund" }),
    kind: "fund",
    memo: null,
    orgAccountId: null,
  },
  {
    accountHeadId: null,
    booksPaise: 11_250_00,
    fundId: GENERAL_FUND_ID,
    key: auditedLineKey({ fundId: GENERAL_FUND_ID, kind: "fund" }),
    kind: "fund",
    memo: null,
    orgAccountId: null,
  },
];

const keyOf = (kind: string, id: string) =>
  BOOKS.find(
    (l) =>
      l.kind === kind &&
      (l.orgAccountId === id || l.accountHeadId === id || l.fundId === id)
  )?.key as string;

/** Audited figures equal to the books, with `changes` applied by key. */
function auditedAs(changes: Record<string, number> = {}): AuditedLineInput[] {
  return BOOKS.map((l) => ({
    auditedPaise: changes[l.key] ?? l.booksPaise,
    key: l.key,
  }));
}

const NO_HEADS = new Map<string, "income" | "expense">();

/** The net surplus of the plan's entries, and whether they keep the books balanced. */
function effectOnBooks(plan: ReturnType<typeof planAuditedFigures>) {
  let assets = 0;
  let liabilities = 0;
  let funds = 0;
  for (const e of plan.entries) {
    const signed = e.effect === "increase" ? e.amountPaise : -e.amountPaise;
    if (
      e.accountHeadId === H.fixedAssets ||
      e.accountHeadId === H.supplierAdvances
    ) {
      assets += signed;
    } else if (
      e.accountHeadId === H.auditFeesPayable ||
      e.accountHeadId === "new-liability"
    ) {
      liabilities += signed;
    } else if (e.accountHeadId === H.fundTransfers) {
      funds += signed;
    } else {
      const headType =
        e.accountHeadId === "income-head" ||
        e.accountHeadId === H.yearEndAdjustmentsIncome
          ? "income"
          : "expense";
      funds +=
        surplusPaiseOf({
          amountPaise: e.amountPaise,
          effect: e.effect,
          headType,
        }) ?? 0;
    }
  }
  return {
    assets,
    difference: assets - liabilities - funds,
    funds,
    liabilities,
  };
}

describe("planAuditedFigures", () => {
  it("posts nothing when the books already agree", () => {
    const plan = planAuditedFigures({
      audited: auditedAs(),
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(plan.canPost).toBe(true);
    expect(plan.entries).toEqual([]);
    expect(
      plan.lines.every((l) => ["agrees", "fund_check"].includes(l.treatment))
    ).toBe(true);
  });

  it("posts a fixed asset carried at less as depreciation against the asset, and a provision written back as year-end adjustment income", () => {
    const asset = BOOKS[2] as BalanceSheetLine;
    const liability = keyOf("liability", H.auditFeesPayable);
    const general = keyOf("fund", GENERAL_FUND_ID);
    // Depreciation 120, audit fee written back 100: the surplus moves by -20.
    const plan = planAuditedFigures({
      audited: auditedAs({
        [asset.key]: 280_00,
        [liability]: 0,
        [general]: 11_230_00,
      }),
      books: BOOKS,
      counterHeads: NO_HEADS,
      labelOf: (l) => l.memo ?? "Audit fees payable",
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.canPost).toBe(true);
    expect(plan.surplusPaise).toBe(-20_00);
    expect(plan.lines.find((l) => l.key === asset.key)).toMatchObject({
      counterHead: { id: H.depreciation, type: "expense" },
      differencePaise: -120_00,
      treatment: "depreciation",
    });
    expect(plan.lines.find((l) => l.key === liability)).toMatchObject({
      counterHead: { id: H.yearEndAdjustmentsIncome, type: "income" },
      differencePaise: -100_00,
      treatment: "adjustment",
    });
    expect(plan.entries).toEqual([
      {
        accountHeadId: H.fixedAssets,
        amountPaise: 120_00,
        effect: "decrease",
        fundId: GENERAL_FUND_ID,
        memo: "Sewing machine",
      },
      {
        accountHeadId: H.depreciation,
        amountPaise: 120_00,
        effect: "increase",
        fundId: GENERAL_FUND_ID,
        memo: "Per audited accounts: Sewing machine",
      },
      {
        accountHeadId: H.auditFeesPayable,
        amountPaise: 100_00,
        effect: "decrease",
        fundId: GENERAL_FUND_ID,
        memo: "Per audited accounts: Audit fees payable",
      },
      {
        accountHeadId: H.yearEndAdjustmentsIncome,
        amountPaise: 100_00,
        effect: "increase",
        fundId: GENERAL_FUND_ID,
        memo: "Per audited accounts: Audit fees payable",
      },
    ]);
    expect(plan.funds.find((f) => f.fundId === GENERAL_FUND_ID)).toMatchObject({
      afterPaise: 11_230_00,
      differencePaise: 0,
      surplusPaise: -20_00,
    });
    // The posting balances: the balance check stays where it was.
    expect(effectOnBooks(plan)).toMatchObject({ difference: 0, funds: -20_00 });
  });

  it("writes a fixed asset up as a year-end adjustment, and lets the treasurer pick another head", () => {
    const asset = BOOKS[2] as BalanceSheetLine;
    const advances = keyOf("asset", H.supplierAdvances);
    const general = keyOf("fund", GENERAL_FUND_ID);
    const plan = planAuditedFigures({
      audited: [
        ...auditedAs({
          [asset.key]: 450_00,
          [general]: 11_250_00,
        }).filter((a) => a.key !== advances),
        { auditedPaise: 0, counterHeadId: "income-head", key: advances },
      ],
      books: BOOKS,
      counterHeads: new Map([["income-head", "income"]]),
    });
    // Written up: raises the surplus, so year-end adjustment income.
    expect(plan.lines.find((l) => l.key === asset.key)).toMatchObject({
      counterHead: { id: H.yearEndAdjustmentsIncome, type: "income" },
      treatment: "adjustment",
    });
    expect(plan.lines.find((l) => l.key === advances)?.counterHead).toEqual({
      id: "income-head",
      type: "income",
    });
    // +50 on the asset, -50 on the advances: the surplus nets to zero.
    expect(plan.entries).toContainEqual(
      expect.objectContaining({
        accountHeadId: "income-head",
        amountPaise: 50_00,
        effect: "decrease",
      })
    );
    expect(plan.canPost).toBe(true);
    expect(effectOnBooks(plan).difference).toBe(0);
  });

  it("refuses a head that isn't an active income or expense head", () => {
    const liability = keyOf("liability", H.auditFeesPayable);
    const plan = planAuditedFigures({
      audited: [
        ...auditedAs({ [keyOf("fund", GENERAL_FUND_ID)]: 11_350_00 }).filter(
          (a) => a.key !== liability
        ),
        { auditedPaise: 0, counterHeadId: "not-a-head", key: liability },
      ],
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(plan.blockers.map((b) => b.code)).toEqual(["invalid_head"]);
  });

  it("never adjusts a money account: a difference there blocks posting until the records are found", () => {
    const bank = keyOf("account", BANK);
    const plan = planAuditedFigures({
      audited: auditedAs({
        [bank]: 3990_00,
        [keyOf("fund", GENERAL_FUND_ID)]: 11_240_00,
      }),
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(plan.canPost).toBe(false);
    expect(plan.blockers.map((b) => b.code)).toContain("find_records");
    expect(plan.lines.find((l) => l.key === bank)).toMatchObject({
      differencePaise: -10_00,
      treatment: "find_records",
    });
    expect(plan.entries.some((e) => e.accountHeadId === bank)).toBe(false);
  });

  it("waits for every audited figure", () => {
    const plan = planAuditedFigures({
      audited: auditedAs().slice(1),
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(plan.audited).toBeNull();
    expect(plan.blockers[0]?.code).toBe("not_entered");
  });

  it("refuses audited figures that don't balance", () => {
    const plan = planAuditedFigures({
      audited: auditedAs({ [keyOf("fund", CORPUS_FUND_ID)]: 150_00 }),
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(plan.audited?.balanced).toBe(false);
    expect(plan.blockers.map((b) => b.code)).toEqual([
      "audited_unbalanced",
      "fund_differs",
    ]);
  });

  it("refuses books that don't balance", () => {
    const books = BOOKS.map((l) =>
      l.kind === "account" && l.orgAccountId === BANK
        ? { ...l, booksPaise: l.booksPaise + 1 }
        : l
    );
    const plan = planAuditedFigures({
      audited: books.map((l) => ({ auditedPaise: l.booksPaise, key: l.key })),
      books,
      counterHeads: NO_HEADS,
    });
    expect(plan.blockers[0]?.code).toBe("books_unbalanced");
  });

  it("checks funds after the adjustments, and moves money between funds only by an explicit transfer with a reason", () => {
    const corpus = keyOf("fund", CORPUS_FUND_ID);
    const general = keyOf("fund", GENERAL_FUND_ID);
    const audited = auditedAs({ [corpus]: 150_00, [general]: 11_200_00 });
    const without = planAuditedFigures({
      audited,
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(without.blockers.map((b) => b.code)).toEqual(["fund_differs"]);
    expect(
      without.funds.find((f) => f.fundId === CORPUS_FUND_ID)?.differencePaise
    ).toBe(50_00);

    const noReason = planAuditedFigures({
      audited,
      books: BOOKS,
      counterHeads: NO_HEADS,
      transfers: [
        {
          amountPaise: 50_00,
          fromFundId: GENERAL_FUND_ID,
          reason: " ",
          toFundId: CORPUS_FUND_ID,
        },
      ],
    });
    expect(noReason.blockers.map((b) => b.code)).toContain("invalid_transfer");

    const plan = planAuditedFigures({
      audited,
      books: BOOKS,
      counterHeads: NO_HEADS,
      transfers: [
        {
          amountPaise: 50_00,
          fromFundId: GENERAL_FUND_ID,
          reason: "Corpus share of the FD per the CA",
          toFundId: CORPUS_FUND_ID,
        },
      ],
    });
    expect(plan.canPost).toBe(true);
    expect(plan.entries).toEqual([
      expect.objectContaining({
        accountHeadId: H.fundTransfers,
        amountPaise: 50_00,
        effect: "decrease",
        fundId: GENERAL_FUND_ID,
      }),
      expect.objectContaining({
        accountHeadId: H.fundTransfers,
        amountPaise: 50_00,
        effect: "increase",
        fundId: CORPUS_FUND_ID,
      }),
    ]);
    expect(effectOnBooks(plan)).toMatchObject({ difference: 0, funds: 0 });
  });

  it("adds an audited line the books don't have, and refuses one already listed", () => {
    const general = keyOf("fund", GENERAL_FUND_ID);
    const plan = planAuditedFigures({
      added: [
        {
          accountHeadId: "new-liability",
          auditedPaise: 75_00,
          kind: "liability",
          memo: "Audit fees payable FY 2026-27",
        },
      ],
      audited: auditedAs({ [general]: 11_175_00 }),
      books: BOOKS,
      counterHeads: NO_HEADS,
      labelOf: (l) => l.memo ?? "",
    });
    expect(plan.canPost).toBe(true);
    const added = plan.lines.find((l) => l.added);
    expect(added).toMatchObject({
      booksPaise: 0,
      differencePaise: 75_00,
      treatment: "adjustment",
    });
    // A new provision is an expense of the year.
    expect(plan.entries).toContainEqual({
      accountHeadId: H.yearEndAdjustments,
      amountPaise: 75_00,
      effect: "increase",
      fundId: GENERAL_FUND_ID,
      memo: "Per audited accounts: Audit fees payable FY 2026-27",
    });
    expect(effectOnBooks(plan).difference).toBe(0);

    const duplicate = planAuditedFigures({
      added: [
        {
          accountHeadId: H.auditFeesPayable,
          auditedPaise: 0,
          kind: "liability",
        },
      ],
      audited: auditedAs(),
      books: BOOKS,
      counterHeads: NO_HEADS,
    });
    expect(duplicate.blockers.map((b) => b.code)).toContain("duplicate_line");
  });
});

describe("balanceSheetLines", () => {
  it("lists each account, each fixed asset by its name, each liability head and each fund with its surplus", () => {
    const lines = balanceSheetLines({
      accountIds: [BANK, FD],
      asOf: "2027-03-31",
      entries: [
        {
          accountHeadId: H.fixedAssets,
          amountPaise: 400_00,
          economicOn: "2026-04-01",
          effect: "increase",
          fundId: GENERAL_FUND_ID,
          headType: "asset",
          memo: "Sewing machine",
          sourceType: "opening_balance",
        },
        {
          accountHeadId: H.fixedAssets,
          amountPaise: 30_00,
          economicOn: "2026-05-01",
          effect: "increase",
          fundId: GENERAL_FUND_ID,
          headType: "asset",
          memo: "Bought by a vendor payment",
          sourceType: "vendor_payment",
        },
        {
          accountHeadId: H.fixedAssets,
          amountPaise: 100_00,
          economicOn: "2027-03-31",
          effect: "decrease",
          fundId: GENERAL_FUND_ID,
          headType: "asset",
          memo: " Sewing machine ",
          sourceType: "audited_figures",
        },
        {
          accountHeadId: H.donationsReceived,
          amountPaise: 500_00,
          economicOn: "2026-06-01",
          effect: "increase",
          fundId: GENERAL_FUND_ID,
          headType: "income",
          memo: null,
          sourceType: "contribution",
        },
        {
          accountHeadId: H.auditFeesPayable,
          amountPaise: 100_00,
          economicOn: "2026-04-01",
          effect: "increase",
          fundId: GENERAL_FUND_ID,
          headType: "liability",
          memo: "Audit fees",
          sourceType: "opening_balance",
        },
        {
          accountHeadId: H.donationsReceived,
          amountPaise: 1_00,
          economicOn: "2027-04-01",
          effect: "increase",
          fundId: GENERAL_FUND_ID,
          headType: "income",
          memo: null,
          sourceType: "contribution",
        },
      ],
      fundIds: [CORPUS_FUND_ID],
      movements: [
        {
          amountPaise: 900_00,
          direction: "in",
          id: "m1",
          occurredOn: "2026-06-01",
          orgAccountId: BANK,
        },
      ],
    });
    expect(lines.map((l) => [l.key, l.booksPaise])).toEqual([
      [`account:${BANK}`, 900_00],
      [`account:${FD}`, 0],
      [`asset:${H.fixedAssets}:Sewing machine`, 300_00],
      [`asset:${H.fixedAssets}:`, 30_00],
      [`liability:${H.auditFeesPayable}`, 100_00],
      [`fund:${CORPUS_FUND_ID}`, 0],
      [`fund:${GENERAL_FUND_ID}`, 500_00],
    ]);
  });
});

describe("auditedDrift", () => {
  it("is empty while the books equal the matched figures", () => {
    expect(
      auditedDrift(
        [{ auditedPaise: 100, key: "a" }],
        [
          { booksPaise: 100, key: "a" },
          { booksPaise: 0, key: "new-empty-account" },
        ]
      )
    ).toEqual([]);
  });

  it("flags a moved line, a vanished one and one that appeared since", () => {
    expect(
      auditedDrift(
        [
          { auditedPaise: 100, key: "a" },
          { auditedPaise: 50, key: "gone" },
        ],
        [
          { booksPaise: 90, key: "a" },
          { booksPaise: 7, key: "new" },
        ]
      )
    ).toEqual([
      { auditedPaise: 100, key: "a", nowPaise: 90 },
      { auditedPaise: 50, key: "gone", nowPaise: 0 },
      { auditedPaise: null, key: "new", nowPaise: 7 },
    ]);
  });
});

describe("buildAuditedPayload", () => {
  const snapshot = [
    { booksPaise: 100, key: "account:a" },
    { booksPaise: 200, key: "asset:h:Machine" },
    { booksPaise: 300, key: "fund:g" },
  ];

  it("pairs each snapshot line with the figure typed against its key, whatever the order", () => {
    const payload = buildAuditedPayload(snapshot, [
      { auditedPaise: 3, key: "fund:g" },
      { auditedPaise: 1, key: "account:a" },
      { auditedPaise: 2, counterHeadId: "head", key: "asset:h:Machine" },
    ]);
    expect(payload).toEqual({
      lines: [
        {
          auditedPaise: 1,
          booksPaise: 100,
          counterHeadId: null,
          key: "account:a",
        },
        {
          auditedPaise: 2,
          booksPaise: 200,
          counterHeadId: "head",
          key: "asset:h:Machine",
        },
        {
          auditedPaise: 3,
          booksPaise: 300,
          counterHeadId: null,
          key: "fund:g",
        },
      ],
      ok: true,
    });
  });

  it("refuses while a snapshot line has no figure, and ignores figures for lines it doesn't hold", () => {
    expect(
      buildAuditedPayload(snapshot, [
        { auditedPaise: 1, key: "account:a" },
        { auditedPaise: null, key: "asset:h:Machine" },
        { auditedPaise: 9, key: "asset:h:" },
      ])
    ).toEqual({ missing: ["asset:h:Machine", "fund:g"], ok: false });
    const payload = buildAuditedPayload(snapshot, [
      { auditedPaise: 1, key: "account:a" },
      { auditedPaise: 2, key: "asset:h:Machine" },
      { auditedPaise: 3, key: "fund:g" },
      { auditedPaise: 9, key: "account:new" },
    ]);
    expect(payload.ok && payload.lines.map((l) => l.key)).toEqual([
      "account:a",
      "asset:h:Machine",
      "fund:g",
    ]);
  });
});

describe("booksChangedSince", () => {
  const snapshot = [
    { booksPaise: 100, key: "a" },
    { booksPaise: 200, key: "b" },
  ];
  it("ignores order but sees a changed figure, a new line and a dropped one", () => {
    expect(booksChangedSince(snapshot, [...snapshot].reverse())).toBe(false);
    expect(
      booksChangedSince(snapshot, [
        { booksPaise: 100, key: "a" },
        { booksPaise: 201, key: "b" },
      ])
    ).toBe(true);
    expect(
      booksChangedSince(snapshot, [...snapshot, { booksPaise: 0, key: "c" }])
    ).toBe(true);
    expect(booksChangedSince(snapshot, [{ booksPaise: 100, key: "a" }])).toBe(
      true
    );
    // A fixed asset first synced on its head's other line, then by its name.
    expect(
      booksChangedSince(
        [{ booksPaise: 100, key: "asset:h:" }],
        [{ booksPaise: 100, key: "asset:h:Machine" }]
      )
    ).toBe(true);
  });
});
