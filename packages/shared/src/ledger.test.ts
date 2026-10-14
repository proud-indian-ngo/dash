import { describe, expect, it } from "vitest";

import {
  balanceSummary,
  booksAsOf,
  type BookEntry,
  type BookMovement,
  cashBook,
  incomeExpenditure,
  openingBalanceCheck,
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
  it("balances opening lines and the running surplus", () => {
    const summary = balanceSummary({
      accountIds: ["bank", "fd", "razorpay"],
      asOf: "2026-06-30",
      entries: [
        entry("fa", "asset", 40),
        entry("af", "liability", 10),
        entry("cf", "fund", 30, { fundId: "corpus" }),
        entry("gf", "fund", 1000),
        entry("inc", "income", 200, { economicOn: "2026-05-01" }),
        entry("late", "income", 7, { economicOn: "2026-07-01" }),
      ],
      movements: [
        move("o1", "2026-04-01", "in", 700),
        move("o2", "2026-04-01", "in", 300, "fd"),
        move("r", "2026-05-01", "in", 200),
      ],
    });
    expect(summary.assets.map((l) => [l.key, l.paise])).toEqual([
      ["bank", 900],
      ["fd", 300],
      ["razorpay", 0],
      ["asset-head", 40],
    ]);
    expect(summary.funds.map((l) => [l.key, l.paise])).toEqual([
      ["corpus", 30],
      ["general", 1000],
      ["surplus", 200],
    ]);
    expect(summary).toMatchObject({
      assetsPaise: 1240,
      balanced: true,
      differencePaise: 0,
      liabilitiesPaise: 10,
    });
  });
});

describe("booksAsOf", () => {
  it("reads at today inside the year and at the year end after it", () => {
    expect(booksAsOf(FY, "2026-10-14")).toBe("2026-10-14");
    expect(booksAsOf(FY, "2027-06-01")).toBe("2027-03-31");
    expect(booksAsOf(FY, "2026-01-01")).toBe("2026-04-01");
  });
});
