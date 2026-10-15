import { describe, expect, it } from "vitest";

import { LEDGER_ACCOUNT_HEAD_IDS } from "./constants";
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
        movement: { additionsPaise: 0, openingPaise: 1000, surplusPaise: 200 },
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
        movement: { additionsPaise: 0, openingPaise: 30, surplusPaise: 50 },
        paise: 80,
      },
      {
        key: "general",
        kind: "fund",
        movement: { additionsPaise: 0, openingPaise: 1000, surplusPaise: 400 },
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
        movement: { additionsPaise: 0, openingPaise: 80, surplusPaise: 0 },
        paise: 80,
      },
      {
        key: "general",
        kind: "fund",
        movement: { additionsPaise: 0, openingPaise: 1400, surplusPaise: -290 },
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
      additionsPaise: 0,
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

describe("corpus gifts in the books", () => {
  const CORPUS_HEAD = LEDGER_ACCOUNT_HEAD_IDS.corpusDonations;
  const corpusGift = (id: string, amountPaise: number, extra = {}) =>
    entry(id, "fund", amountPaise, {
      accountHeadId: CORPUS_HEAD,
      economicOn: "2026-08-01",
      fundId: "corpus",
      ...extra,
    });
  const entries = [
    entry("cf", "fund", 30, { fundId: "corpus" }),
    entry("gf", "fund", 1000),
    entry("inc", "income", 200, { economicOn: "2026-05-01" }),
    // A 500 corpus gift through Razorpay: the gross to the Corpus Fund,
    // its 12 fee General Fund expenditure; a 100 refund of it later.
    corpusGift("corpus", 500),
    entry("fee", "expense", 12, { economicOn: "2026-08-01" }),
    corpusGift("corpus-refund", 100, {
      economicOn: "2026-09-01",
      effect: "decrease",
    }),
  ];
  const movements = [
    move("o1", "2026-04-01", "in", 1030),
    move("m1", "2026-05-01", "in", 200),
    move("m2", "2026-08-01", "in", 500, "razorpay"),
    move("m3", "2026-08-01", "out", 12, "razorpay"),
    move("m4", "2026-09-01", "out", 100, "razorpay"),
  ];

  it("leaves a corpus gift out of income and expenditure, keeping its fee in", () => {
    const ie = incomeExpenditure(entries, FY, "head");
    expect(ie.incomeTotalPaise).toBe(200);
    expect(ie.expenseTotalPaise).toBe(12);
    expect(ie.surplusPaise).toBe(188);
    expect(ie.income.map((l) => l.key)).not.toContain(CORPUS_HEAD);
  });

  it("shows a corpus gift as the Corpus Fund's addition, and its fee in the General Fund", () => {
    const summary = balanceSummary({
      accountIds: ["bank", "razorpay"],
      asOf: FY.endsOn,
      entries,
      movements,
      startsOn: FY.startsOn,
    });
    expect(summary.balanced).toBe(true);
    expect(summary.differencePaise).toBe(0);
    expect(summary.funds).toEqual([
      {
        key: "corpus",
        kind: "fund",
        movement: { additionsPaise: 400, openingPaise: 30, surplusPaise: 0 },
        paise: 430,
      },
      {
        key: "general",
        kind: "fund",
        movement: { additionsPaise: 0, openingPaise: 1000, surplusPaise: 188 },
        paise: 1188,
      },
    ]);
    // The next year opens the Corpus Fund with the gift.
    const next = balanceSummary({
      accountIds: ["bank", "razorpay"],
      asOf: "2028-03-31",
      entries,
      movements,
      startsOn: "2027-04-01",
    });
    expect(next.balanced).toBe(true);
    expect(next.funds[0]).toEqual({
      key: "corpus",
      kind: "fund",
      movement: { additionsPaise: 0, openingPaise: 430, surplusPaise: 0 },
      paise: 430,
    });
  });
});

/** A small seeded generator, so a failing ledger can be replayed. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe("balanceSummary over random ledgers", () => {
  const YEARS = [
    { endsOn: "2027-03-31", startsOn: "2026-04-01" },
    { endsOn: "2028-03-31", startsOn: "2027-04-01" },
    { endsOn: "2029-03-31", startsOn: "2028-04-01" },
    { endsOn: "2030-03-31", startsOn: "2029-04-01" },
  ];
  const CORPUS_HEAD = LEDGER_ACCOUNT_HEAD_IDS.corpusDonations;

  /**
   * Opening balances, then gifts (income or corpus), gateway fees on them
   * (always the General Fund), refunds, spending and its refunds, each
   * with the money it moves, across four years.
   */
  function randomLedger(seed: number) {
    const rand = seeded(seed);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(rand() * list.length)] as T;
    const amount = () => 1 + Math.floor(rand() * 100_000);
    const day = () => {
      const year = pick(YEARS);
      const start = Date.parse(`${year.startsOn}T00:00:00Z`);
      return new Date(start + Math.floor(rand() * 365) * 86_400_000)
        .toISOString()
        .slice(0, 10);
    };
    const entries: BookEntry[] = [];
    const movements: BookMovement[] = [];
    let n = 0;
    const id = (prefix: string) => {
      n += 1;
      return `${prefix}-${String(n).padStart(5, "0")}`;
    };
    const money = (on: string, direction: "in" | "out", paise: number) =>
      movements.push(
        move(id("m"), on, direction, paise, pick(["bank", "rzp"]))
      );
    const corpusOpening = amount();
    const generalOpening = amount();
    entries.push(
      entry(id("e"), "fund", corpusOpening, { fundId: "corpus" }),
      entry(id("e"), "fund", generalOpening)
    );
    money("2026-04-01", "in", corpusOpening + generalOpening);
    for (let i = 0; i < 40; i += 1) {
      const on = day();
      const paise = amount();
      const kind = pick(["gift", "corpus", "spend"] as const);
      if (kind === "spend") {
        entries.push(entry(id("e"), "expense", paise, { economicOn: on }));
        money(on, "out", paise);
        if (rand() < 0.3) {
          const back = Math.ceil(paise / 2);
          entries.push(
            entry(id("e"), "expense", back, {
              economicOn: on,
              effect: "decrease",
            })
          );
          money(on, "in", back);
        }
        continue;
      }
      const credit =
        kind === "corpus"
          ? { accountHeadId: CORPUS_HEAD, fundId: "corpus" }
          : { fundId: pick(["general", "corpus"]) };
      const headType = kind === "corpus" ? "fund" : "income";
      entries.push(
        entry(id("e"), headType, paise, { ...credit, economicOn: on })
      );
      money(on, "in", paise);
      if (rand() < 0.5) {
        const fee = Math.ceil(paise / 50);
        entries.push(entry(id("e"), "expense", fee, { economicOn: on }));
        money(on, "out", fee);
      }
      if (rand() < 0.2) {
        const refund = Math.ceil(paise / 4);
        entries.push(
          entry(id("e"), headType, refund, {
            ...credit,
            economicOn: on,
            effect: "decrease",
          })
        );
        money(on, "out", refund);
      }
    }
    return { entries, movements };
  }

  it("balances every year of 300 ledgers, each fund rolling into the next year", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { entries, movements } = randomLedger(seed);
      let previous: Map<string, number> | null = null;
      for (const year of YEARS) {
        const summary = balanceSummary({
          accountIds: ["bank", "rzp"],
          asOf: year.endsOn,
          entries,
          movements,
          startsOn: year.startsOn,
        });
        expect(summary.differencePaise, `seed ${seed}`).toBe(0);
        const ie = incomeExpenditure(entries, year, "head");
        let surplus = 0;
        const totals = new Map<string, number>();
        for (const fund of summary.funds) {
          const m = fund.movement ?? {
            additionsPaise: 0,
            openingPaise: fund.paise,
            surplusPaise: 0,
          };
          expect(m.openingPaise + m.additionsPaise + m.surplusPaise).toBe(
            fund.paise
          );
          if (previous) {
            expect(m.openingPaise, `seed ${seed}`).toBe(
              previous.get(fund.key) ?? 0
            );
          }
          // Corpus gifts are the only additions, and only the Corpus Fund's.
          if (fund.key !== "corpus") {
            expect(m.additionsPaise).toBe(0);
          }
          surplus += m.surplusPaise;
          totals.set(fund.key, fund.paise);
        }
        // The funds' surpluses are the I&E surplus: corpus gifts aren't in it.
        expect(surplus, `seed ${seed}`).toBe(ie.surplusPaise);
        expect(ie.income.map((l) => l.key)).not.toContain(CORPUS_HEAD);
        previous = totals;
      }
    }
  });
});
