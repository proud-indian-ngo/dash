import { describe, expect, it } from "vitest";

import {
  balanceSummary,
  booksAsOf,
  type BookEntry,
  type BookMovement,
  cashBook,
  incomeExpenditure,
  openingBalanceCheck,
  surplusPaiseOf,
} from "./ledger";

const FY = { endsOn: "2027-03-31", startsOn: "2026-04-01" };

const move = (
  id: string,
  occurredOn: string,
  direction: "in" | "out",
  amountPaise: number,
  orgAccountId = "bank"
): BookMovement => ({ amountPaise, direction, id, occurredOn, orgAccountId });

const entry = (
  id: string,
  headType: BookEntry["headType"],
  amountPaise: number,
  extra: Partial<BookEntry> = {}
): BookEntry => ({
  accountHeadId: `${headType}-head`,
  amountPaise,
  economicOn: "2026-04-01",
  effect: "increase",
  fundId: "general",
  headType,
  id,
  programmeId: null,
  ...extra,
});

describe("openingBalanceCheck", () => {
  it("balances when assets equal funds plus liabilities", () => {
    const check = openingBalanceCheck([
      { amountPaise: 1000_00, kind: "account" },
      { amountPaise: 50_00, kind: "asset" },
      { amountPaise: 1040_00, kind: "fund" },
      { amountPaise: 10_00, kind: "liability" },
    ]);
    expect(check).toEqual({
      assetsPaise: 1050_00,
      balanced: true,
      differencePaise: 0,
      fundsPaise: 1040_00,
      liabilitiesPaise: 10_00,
    });
  });

  it("refuses an unbalanced or empty document", () => {
    expect(
      openingBalanceCheck([
        { amountPaise: 100, kind: "account" },
        { amountPaise: 99, kind: "fund" },
      ])
    ).toMatchObject({ balanced: false, differencePaise: 1 });
    expect(openingBalanceCheck([]).balanced).toBe(false);
  });
});

describe("cashBook", () => {
  it("runs a balance from movements before the range", () => {
    const book = cashBook(
      [
        move("b", "2026-05-02", "out", 300),
        move("a", "2026-04-01", "in", 1000),
        move("x", "2026-04-03", "in", 999, "fd"),
        move("c", "2027-04-01", "in", 50),
      ],
      "bank",
      { endsOn: "2027-03-31", startsOn: "2026-05-01" }
    );
    expect(book.openingPaise).toBe(1000);
    expect(book.rows.map((r) => [r.id, r.balancePaise, r.month])).toEqual([
      ["b", 700, "2026-05"],
    ]);
    expect(book).toMatchObject({
      closingPaise: 700,
      inPaise: 0,
      netPaise: -300,
      outPaise: 300,
    });
  });
});

describe("cashBook ordering and openings", () => {
  it("orders same-day movements by id, so a reversal and repost run in order", () => {
    const book = cashBook(
      [
        // Out of order on purpose; ids are time-ordered.
        { ...move("0003", "2026-04-01", "in", 900), kind: "opening" as const },
        { ...move("0001", "2026-04-01", "in", 1000), kind: "opening" as const },
        {
          ...move("0002", "2026-04-01", "out", 1000),
          kind: "opening" as const,
        },
        { ...move("0004", "2026-04-01", "in", 50), kind: "receipt" as const },
      ],
      "bank",
      FY
    );
    expect(book.rows.map((r) => [r.id, r.balancePaise])).toEqual([
      ["0001", 1000],
      ["0002", 0],
      ["0003", 900],
      ["0004", 950],
    ]);
  });

  it("folds the year's opening movements into the opening balance", () => {
    const book = cashBook(
      [
        { ...move("0001", "2026-04-01", "in", 1000), kind: "opening" as const },
        { ...move("0002", "2026-05-01", "in", 200), kind: "receipt" as const },
        { ...move("0003", "2026-06-01", "out", 50), kind: "payout" as const },
      ],
      "bank",
      FY
    );
    expect(book).toMatchObject({
      closingPaise: 1150,
      inPaise: 200,
      netPaise: 150,
      openingPaise: 1000,
      outPaise: 50,
    });
  });
});

describe("incomeExpenditure", () => {
  it("nets decreases and groups by head or programme", () => {
    const entries = [
      entry("1", "income", 500, { programmeId: "edu" }),
      entry("2", "income", 100, { effect: "decrease", programmeId: "edu" }),
      entry("3", "expense", 150, { programmeId: "art" }),
      entry("4", "fund", 9999),
      entry("5", "income", 1, { economicOn: "2026-03-31" }),
    ];
    const byHead = incomeExpenditure(entries, FY, "head");
    expect(byHead.incomeTotalPaise).toBe(400);
    expect(byHead.expenseTotalPaise).toBe(150);
    expect(byHead.surplusPaise).toBe(250);
    expect(byHead.income).toEqual([
      { count: 2, key: "income-head", paise: 400 },
    ]);
    const byProgramme = incomeExpenditure(entries, FY, "programme");
    expect(byProgramme.expense).toEqual([{ count: 1, key: "art", paise: 150 }]);
  });
});

describe("balanceSummary", () => {
  const openingEntries = [
    entry("fa", "asset", 40),
    entry("af", "liability", 10),
    entry("cf", "fund", 30, { fundId: "corpus" }),
    entry("gf", "fund", 1000),
  ];
  const openingMoves = [
    move("o1", "2026-04-01", "in", 700),
    move("o2", "2026-04-01", "in", 300, "fd"),
  ];

  it("balances the opening lines with the year's surplus in the General Fund", () => {
    const summary = balanceSummary({
      accountIds: ["bank", "fd", "razorpay"],
      asOf: "2026-06-30",
      entries: [
        ...openingEntries,
        entry("inc", "income", 200, { economicOn: "2026-05-01" }),
        entry("late", "income", 7, { economicOn: "2026-07-01" }),
      ],
      movements: [...openingMoves, move("r", "2026-05-01", "in", 200)],
      startsOn: FY.startsOn,
    });
    expect(summary.assets.map((l) => [l.key, l.paise])).toEqual([
      ["bank", 900],
      ["fd", 300],
      ["razorpay", 0],
      ["asset-head", 40],
    ]);
    expect(summary.funds).toEqual([
      { key: "corpus", kind: "fund", paise: 30 },
      {
        key: "general",
        kind: "fund",
        movement: { openingPaise: 1000, surplusPaise: 200 },
        paise: 1200,
      },
    ]);
    expect(summary).toMatchObject({
      assetsPaise: 1240,
      balanced: true,
      differencePaise: 0,
      liabilitiesPaise: 10,
    });
  });

  it("opens the next year with earlier surplus, shows its deficit, and rolls restricted income into its own fund", () => {
    const entries = [
      ...openingEntries,
      // FY 2026-27: 500 of income and 100 of spending in the General
      // Fund, a 50 corpus gift in the Corpus Fund.
      entry("inc", "income", 500, { economicOn: "2026-05-01" }),
      entry("exp", "expense", 100, { economicOn: "2026-06-01" }),
      entry("corpus", "income", 50, {
        economicOn: "2026-07-01",
        fundId: "corpus",
      }),
      // FY 2027-28: 300 spent, 20 of it refunded; a 10 donor refund.
      entry("exp2", "expense", 300, { economicOn: "2027-05-01" }),
      entry("back", "expense", 20, {
        economicOn: "2027-05-02",
        effect: "decrease",
      }),
      entry("ref", "income", 10, {
        economicOn: "2027-05-03",
        effect: "decrease",
      }),
    ];
    const movements = [
      ...openingMoves,
      move("m1", "2026-05-01", "in", 500),
      move("m2", "2026-06-01", "out", 100),
      move("m3", "2026-07-01", "in", 50),
      move("m4", "2027-05-01", "out", 300),
      move("m5", "2027-05-02", "in", 20),
      move("m6", "2027-05-03", "out", 10),
    ];
    const accountIds = ["bank", "fd"];
    const first = balanceSummary({
      accountIds,
      asOf: FY.endsOn,
      entries,
      movements,
      startsOn: FY.startsOn,
    });
    expect(first.balanced).toBe(true);
    expect(first.funds).toEqual([
      {
        key: "corpus",
        kind: "fund",
        movement: { openingPaise: 30, surplusPaise: 50 },
        paise: 80,
      },
      {
        key: "general",
        kind: "fund",
        movement: { openingPaise: 1000, surplusPaise: 400 },
        paise: 1400,
      },
    ]);

    const second = balanceSummary({
      accountIds,
      asOf: "2028-03-31",
      entries,
      movements,
      startsOn: "2027-04-01",
    });
    expect(second.balanced).toBe(true);
    expect(second.funds).toEqual([
      {
        key: "corpus",
        kind: "fund",
        movement: { openingPaise: 80, surplusPaise: 0 },
        paise: 80,
      },
      {
        key: "general",
        kind: "fund",
        movement: { openingPaise: 1400, surplusPaise: -290 },
        paise: 1110,
      },
    ]);
  });
});

describe("balanceSummary fund openings", () => {
  const entries = [
    entry("gf", "fund", 1000),
    entry("inc", "income", 500, { economicOn: "2026-05-01" }),
    entry("inc2", "income", 70, { economicOn: "2027-05-01" }),
    entry("exp2", "expense", 20, { economicOn: "2027-08-01" }),
  ];
  const movements = [
    move("o1", "2026-04-01", "in", 1000),
    move("m1", "2026-05-01", "in", 500),
    move("m2", "2027-05-01", "in", 70),
    move("m3", "2027-08-01", "out", 20),
  ];
  const general = (asOf: string, startsOn: string) =>
    balanceSummary({ accountIds: ["bank"], asOf, entries, movements, startsOn })
      .funds[0];

  it("reads mid-year with the year-to-date surplus apart from the opening", () => {
    expect(general("2027-06-30", "2027-04-01")).toMatchObject({
      movement: { openingPaise: 1500, surplusPaise: 70 },
      paise: 1570,
    });
  });

  it("carries the surplus across a year with no entries", () => {
    const summary = balanceSummary({
      accountIds: ["bank"],
      asOf: "2027-03-31",
      entries: entries.slice(0, 2),
      movements: movements.slice(0, 2),
      startsOn: "2026-04-01",
    });
    expect(summary.funds[0]?.movement).toEqual({
      openingPaise: 1000,
      surplusPaise: 500,
    });
    const later = balanceSummary({
      accountIds: ["bank"],
      asOf: "2029-03-31",
      entries: entries.slice(0, 2),
      movements: movements.slice(0, 2),
      startsOn: "2028-04-01",
    });
    expect(later.funds[0]).toMatchObject({
      movement: { openingPaise: 1500, surplusPaise: 0 },
      paise: 1500,
    });
    expect(later.balanced).toBe(true);
  });

  // Pins an assumption: only the opening balances post to fund heads, so a
  // fund-balance entry dated inside the year is read as part of the opening.
  it("counts a fund-balance entry dated in the year as part of the opening", () => {
    const summary = balanceSummary({
      accountIds: ["bank"],
      asOf: "2027-12-31",
      entries: [
        ...entries,
        entry("adj", "fund", 30, { economicOn: "2027-09-01" }),
        entry("adj-asset", "asset", 30, { economicOn: "2027-09-01" }),
      ],
      movements,
      startsOn: "2027-04-01",
    });
    expect(summary.funds[0]).toMatchObject({
      movement: { openingPaise: 1530, surplusPaise: 50 },
      paise: 1580,
    });
    expect(summary.balanced).toBe(true);
  });
});

describe("surplusPaiseOf", () => {
  it("raises on income and spending refunds, lowers on spending and donor refunds", () => {
    expect(surplusPaiseOf(entry("a", "income", 5))).toBe(5);
    expect(
      surplusPaiseOf(entry("b", "income", 5, { effect: "decrease" }))
    ).toBe(-5);
    expect(surplusPaiseOf(entry("c", "expense", 5))).toBe(-5);
    expect(
      surplusPaiseOf(entry("d", "expense", 5, { effect: "decrease" }))
    ).toBe(5);
    expect(surplusPaiseOf(entry("e", "fund", 5))).toBeNull();
  });
});

describe("booksAsOf", () => {
  it("reads at today inside the year and at the year end after it", () => {
    expect(booksAsOf(FY, "2026-10-14")).toBe("2026-10-14");
    expect(booksAsOf(FY, "2027-06-01")).toBe("2027-03-31");
    expect(booksAsOf(FY, "2026-01-01")).toBe("2026-04-01");
  });
});
