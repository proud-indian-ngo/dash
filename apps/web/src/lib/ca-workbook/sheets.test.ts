import { describe, expect, it } from "bun:test";

import type {
  WorkbookEntry,
  WorkbookFacts,
  WorkbookMovement,
} from "@pi-dash/db/queries/ca-workbook";
import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import {
  balanceSummary,
  type BookEntry,
  type BookMovement,
} from "@pi-dash/shared/ledger";
import { strFromU8, unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";

import type { AllGiftsRow } from "@/lib/donations-return-export";

import {
  balanceSheet,
  donorSheet,
  incomeExpenditureSheet,
  incomeExpenditureTotals,
  backfilledFlags,
  receiptsAndPaymentsSheet,
  SHEET_NAMES,
  summarySheet,
  withheldDonorSheet,
  type WorkbookSheet,
} from "./sheets";
import {
  DATE_FORMAT,
  excelDate,
  guardText,
  INR_FORMAT,
  toCell,
  writeWorkbook,
} from "./xlsx";

/*
 * A fixture ledger for FY 2026-27: the opening balances, a Razorpay gift
 * with its fee, its payout to the bank, a UPI gift reclassified (reversal
 * and repost) and partly refunded, and FD interest.
 */

const BANK = "acc-bank";
const FD = "acc-fd";
const CLEARING = "acc-clearing";

let seq = 0;
const nextId = (prefix: string) => {
  seq += 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
};

function movement(
  partial: Partial<WorkbookMovement> &
    Pick<
      WorkbookMovement,
      "amountPaise" | "direction" | "kind" | "occurredOn" | "orgAccountId"
    > & { sourceId: string; sourceType: string }
): WorkbookMovement {
  return {
    id: nextId("mov"),
    memo: null,
    paymentReference: null,
    postedOn: partial.occurredOn,
    reversesMovementId: null,
    transferId: null,
    ...partial,
  };
}

const HEADS = {
  advances: {
    accountHeadId: "h-advances",
    headName: "Supplier advances",
    headType: "asset",
  },
  charges: {
    accountHeadId: "h-charges",
    headName: "Gateway charges",
    headType: "expense",
  },
  adjustments: {
    accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.yearEndAdjustments,
    headName: "Year-end adjustments (audited)",
    headType: "expense",
  },
  depreciation: {
    accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.depreciation,
    headName: "Depreciation",
    headType: "expense",
  },
  corpus: {
    accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.corpusDonations,
    headName: "Corpus donations",
    headType: "fund",
  },
  donations: {
    accountHeadId: "h-donations",
    headName: "Donations received",
    headType: "income",
  },
  fixedAssets: {
    accountHeadId: "h-assets",
    headName: "Fixed assets",
    headType: "asset",
  },
  fund: { accountHeadId: "h-fund", headName: "Fund balance", headType: "fund" },
  interest: {
    accountHeadId: "h-interest",
    headName: "Interest on fixed deposit",
    headType: "income",
  },
  payable: {
    accountHeadId: "h-payable",
    headName: "Audit fees payable",
    headType: "liability",
  },
} as const;

function entry(
  head: keyof typeof HEADS,
  partial: Partial<WorkbookEntry> &
    Pick<
      WorkbookEntry,
      "amountPaise" | "economicOn" | "sourceId" | "sourceType"
    >
): WorkbookEntry {
  return {
    ...HEADS[head],
    costCentreName: null,
    effect: "increase",
    eventName: null,
    fundId: GENERAL_FUND_ID,
    fundName: "General Fund (Domestic)",
    id: nextId("ent"),
    medium: "monetary",
    memo: null,
    partyName: null,
    postedOn: partial.economicOn,
    programmeId: null,
    programmeName: null,
    projectName: null,
    reversesEntryId: null,
    ...partial,
  };
}

function fixture(): WorkbookFacts {
  seq = 0;
  const ob = { sourceId: "ob-1", sourceType: "opening_balance" };
  const g1 = { sourceId: "gift-1", sourceType: "contribution" };
  const g2 = { sourceId: "gift-2", sourceType: "contribution" };
  const s1 = { sourceId: "set-1", sourceType: "gateway_settlement" };
  const r1 = { sourceId: "ref-1", sourceType: "contribution_refund" };
  const o1 = { sourceId: "oi-1", sourceType: "other_income" };
  const start = "2026-04-01";

  const g2Original = entry("donations", {
    ...g2,
    amountPaise: 50_000,
    economicOn: "2026-05-20",
    partyName: "Ravi Kumar",
    programmeId: "p-edu",
    programmeName: "Education",
  });

  const movements: WorkbookMovement[] = [
    movement({
      ...ob,
      amountPaise: 100_000,
      direction: "in",
      kind: "opening",
      occurredOn: start,
      orgAccountId: BANK,
    }),
    movement({
      ...ob,
      amountPaise: 200_000,
      direction: "in",
      kind: "opening",
      occurredOn: start,
      orgAccountId: FD,
    }),
    movement({
      ...g1,
      amountPaise: 100_000,
      direction: "in",
      kind: "receipt",
      occurredOn: "2026-05-10",
      orgAccountId: CLEARING,
      paymentReference: "pay_ABC",
    }),
    movement({
      ...g1,
      amountPaise: 2360,
      direction: "out",
      kind: "fee",
      occurredOn: "2026-05-10",
      orgAccountId: CLEARING,
    }),
    movement({
      ...s1,
      amountPaise: 97_640,
      direction: "out",
      kind: "transfer",
      occurredOn: "2026-05-12",
      orgAccountId: CLEARING,
      transferId: "set-1",
    }),
    movement({
      ...s1,
      amountPaise: 97_640,
      direction: "in",
      kind: "transfer",
      occurredOn: "2026-05-12",
      orgAccountId: BANK,
      transferId: "set-1",
    }),
    movement({
      ...g2,
      amountPaise: 50_000,
      direction: "in",
      kind: "receipt",
      occurredOn: "2026-05-20",
      orgAccountId: BANK,
      paymentReference: "=HYPERLINK(1)",
    }),
    movement({
      ...r1,
      amountPaise: 20_000,
      direction: "out",
      kind: "refund",
      occurredOn: "2026-06-01",
      orgAccountId: BANK,
    }),
    movement({
      ...o1,
      amountPaise: 3700,
      direction: "in",
      kind: "receipt",
      occurredOn: "2026-07-01",
      orgAccountId: FD,
    }),
  ];
  const entries: WorkbookEntry[] = [
    entry("fixedAssets", {
      ...ob,
      amountPaise: 5000,
      economicOn: start,
      memo: "Sewing machine",
    }),
    entry("payable", { ...ob, amountPaise: 10_000, economicOn: start }),
    entry("fund", {
      ...ob,
      amountPaise: 1000,
      economicOn: start,
      fundId: "f-corpus",
      fundName: "Corpus Fund",
    }),
    entry("fund", { ...ob, amountPaise: 294_000, economicOn: start }),
    entry("donations", {
      ...g1,
      amountPaise: 100_000,
      economicOn: "2026-05-10",
      partyName: "Asha Rao",
      programmeId: "p-edu",
      programmeName: "Education",
    }),
    entry("charges", {
      ...g1,
      amountPaise: 2360,
      economicOn: "2026-05-10",
      programmeId: "p-edu",
      programmeName: "Education",
    }),
    g2Original,
    // Reclassified to Arts a month later: a reversal and a repost.
    entry("donations", {
      ...g2,
      amountPaise: 50_000,
      economicOn: "2026-05-20",
      effect: "decrease",
      partyName: "Ravi Kumar",
      postedOn: "2026-06-25",
      programmeId: "p-edu",
      programmeName: "Education",
      reversesEntryId: g2Original.id,
    }),
    entry("donations", {
      ...g2,
      amountPaise: 50_000,
      economicOn: "2026-05-20",
      partyName: "Ravi Kumar",
      postedOn: "2026-06-25",
      programmeId: "p-arts",
      programmeName: "Arts and culture",
    }),
    entry("donations", {
      ...r1,
      amountPaise: 20_000,
      economicOn: "2026-06-01",
      effect: "decrease",
      partyName: "Ravi Kumar",
      programmeId: "p-arts",
      programmeName: "Arts and culture",
    }),
    entry("interest", { ...o1, amountPaise: 3700, economicOn: "2026-07-01" }),
  ];
  return {
    accounts: [
      { id: BANK, kind: "bank", name: "Current account" },
      { id: FD, kind: "deposit", name: "Fixed deposit" },
      { id: CLEARING, kind: "gateway_clearing", name: "Razorpay clearing" },
    ],
    auditedFigures: new Map(),
    entries,
    lastStatementBalances: new Map([
      [BANK, { balancePaise: 227_640, valueOn: "2027-03-28" }],
    ]),
    movements,
    goLiveOn: "2026-10-20",
    statementBacked: new Set([`${BANK}:set-1`]),
    year: {
      closed: false,
      endsOn: "2027-03-31",
      id: "fy",
      label: "2026-27",
      startsOn: start,
    },
  };
}

const headers = (sheet: WorkbookSheet) => sheet.columns.map((c) => c.header);
const sumColumn = (rows: WorkbookSheet["rows"], index: number) =>
  Math.round(
    rows.reduce((sum, row) => sum + Number(row.cells[index] ?? 0), 0) * 100
  ) / 100;

/**
 * The year after `prior`, FY 2027-28, with every earlier row summed into
 * brought-forward rows the day before, as loadWorkbookFacts reads them.
 */
function nextYear(prior: WorkbookFacts): WorkbookFacts {
  const bfOn = "2027-03-31";
  const sums = new Map<string, number>();
  for (const m of prior.movements) {
    sums.set(
      m.orgAccountId,
      (sums.get(m.orgAccountId) ?? 0) +
        (m.direction === "in" ? m.amountPaise : -m.amountPaise)
    );
  }
  return {
    ...prior,
    entries: prior.entries.map((e) => ({
      ...e,
      economicOn: e.economicOn < "2027-04-01" ? bfOn : e.economicOn,
      reversesEntryId: null,
      // Asset lines keep their source, as loadWorkbookFacts sums them.
      sourceType: ["opening_balance", "audited_figures"].includes(e.sourceType)
        ? e.sourceType
        : "brought_forward",
    })),
    movements: [...sums]
      .filter(([, paise]) => paise !== 0)
      .map(([account, paise]) =>
        movement({
          amountPaise: Math.abs(paise),
          direction: paise > 0 ? "in" : "out",
          kind: "opening",
          occurredOn: bfOn,
          orgAccountId: account,
          sourceId: account,
          sourceType: "brought_forward",
        })
      ),
    year: {
      closed: false,
      endsOn: "2028-03-31",
      id: "fy2",
      label: "2027-28",
      startsOn: "2027-04-01",
    },
  };
}

/** A balance sheet row's opening, increases, decreases and closing. */
const fundRowOf = (sheet: WorkbookSheet, name: string) =>
  sheet.rows.find((r) => r.cells[0] === name)?.cells.slice(1, 5);

/**
 * A 200 corpus gift in FY 2026-27, credited to the Corpus Fund directly
 * (never income).
 */
function withCorpusGift(facts: WorkbookFacts): WorkbookFacts {
  facts.entries.push(
    entry("corpus", {
      amountPaise: 20_000,
      economicOn: "2026-08-01",
      fundId: "f-corpus",
      fundName: "Corpus Fund",
      partyName: "Meera Iyer",
      sourceId: "gift-corpus",
      sourceType: "contribution",
    })
  );
  facts.movements.push(
    movement({
      amountPaise: 20_000,
      direction: "in",
      kind: "receipt",
      occurredOn: "2026-08-01",
      orgAccountId: BANK,
      sourceId: "gift-corpus",
      sourceType: "contribution",
    })
  );
  return facts;
}

/** The Books page's balance summary over the same facts. */
const toBooks = (facts: WorkbookFacts) => {
  const entries: BookEntry[] = facts.entries.map((e) => ({
    accountHeadId: e.accountHeadId,
    amountPaise: e.amountPaise,
    economicOn: e.economicOn,
    effect: e.effect,
    fundId: e.fundId,
    headType: e.headType,
    id: e.id,
    programmeId: e.programmeId,
  }));
  const movements: BookMovement[] = facts.movements.map((m) => ({
    amountPaise: m.amountPaise,
    direction: m.direction,
    id: m.id,
    kind: m.kind,
    occurredOn: m.occurredOn,
    orgAccountId: m.orgAccountId,
  }));
  return balanceSummary({
    accountIds: facts.accounts.map((a) => a.id),
    asOf: facts.year.endsOn,
    entries,
    movements,
    startsOn: facts.year.startsOn,
  });
};

describe("CA workbook sheets", () => {
  it("keeps the contract's column order", () => {
    const facts = fixture();
    expect(headers(receiptsAndPaymentsSheet(facts))).toEqual([
      "Date",
      "Account",
      "Direction",
      "Kind",
      "Amount (INR)",
      "Party name",
      "Payment reference or UTR",
      "Programme",
      "Project",
      "Account head",
      "Document type and reference",
      "Linked transfer reference",
      "Bank statement matched",
      "Movement ID",
    ]);
    expect(headers(incomeExpenditureSheet(facts))).toEqual([
      "Economic date",
      "Posted date",
      "Account head",
      "Income or expense",
      "Amount (INR)",
      "Programme",
      "Project",
      "Event",
      "Cost centre",
      "Fund",
      "Party name",
      "Medium",
      "Document type and reference",
      "Reversal of",
      "Backfilled",
      "Entry ID",
      "Memo",
    ]);
    expect(headers(summarySheet(facts))).toEqual([
      "Account head",
      "Programme",
      "Total for the year (INR)",
    ]);
    expect(headers(balanceSheet(facts).sheet)).toEqual([
      "Item",
      "Opening at 1 April (INR)",
      "Increases (INR)",
      "Decreases (INR)",
      "Closing at 31 March (INR)",
      "Last bank statement balance (INR)",
      "Statement date",
    ]);
    for (const name of Object.values(SHEET_NAMES)) {
      expect(name.length).toBeLessThanOrEqual(31);
    }
  });

  it("lists each account's movements between its balances brought and carried forward", () => {
    const sheet = receiptsAndPaymentsSheet(fixture());
    const bank = sheet.rows.filter((r) => r.cells[1] === "Current account");
    expect(bank.map((r) => r.cells[3])).toEqual([
      "Balance brought forward",
      "Opening",
      "Transfer",
      "Receipt",
      "Refund",
      "Balance carried forward",
    ]);
    expect(bank[0]?.cells[4]).toBe(0);
    expect(bank.at(-1)?.cells[4]).toBe(2276.4);
    // Brought forward plus the movements make the carried forward.
    expect(sumColumn(bank.slice(0, -1), 4)).toBe(2276.4);

    const transfer = bank[2]?.cells ?? [];
    expect(transfer[11]).toBe("set-1");
    expect(transfer[12]).toBe("Yes");
    expect(transfer[10]).toBe("Settlement set-1");
    const upi = bank[3]?.cells ?? [];
    expect(upi[12]).toBe("No");
    // Party and programme from the gift's standing (reposted) recognition.
    expect(upi[5]).toBe("Ravi Kumar");
    expect(upi[7]).toBe("Arts and culture");
    expect(upi[9]).toBe("Donations received");
    const refund = bank[4]?.cells ?? [];
    expect(refund[2]).toBe("Out");
    expect(refund[4]).toBe(-200);

    const clearing = sheet.rows.filter(
      (r) => r.cells[1] === "Razorpay clearing"
    );
    const fee = clearing.find((r) => r.cells[3] === "Fee")?.cells ?? [];
    expect(fee[4]).toBe(-23.6);
    expect(fee[9]).toBe("Gateway charges");
    expect(fee[12]).toBe("n/a");
    expect(clearing.at(-1)?.cells[4]).toBe(0);
  });

  it("marks a movement the books reconciled to a bank line as statement matched", () => {
    const facts = fixture();
    const upi = facts.movements.find(
      (m) => m.orgAccountId === BANK && m.kind === "receipt"
    );
    facts.statementBacked.add(`movement:${upi?.id}`);
    const sheet = receiptsAndPaymentsSheet(facts);
    const row = sheet.rows.find(
      (r) => r.cells[1] === "Current account" && r.cells[3] === "Receipt"
    );
    expect(row?.cells[12]).toBe("Yes");
  });

  it("lists every recognition entry, decreases negative, reversals linked", () => {
    const facts = fixture();
    const sheet = incomeExpenditureSheet(facts);
    expect(sheet.rows).toHaveLength(facts.entries.length);
    const reversal = sheet.rows.find((r) => r.cells[13] !== "");
    expect(reversal?.cells[4]).toBe(-500);
    expect(reversal?.cells[13]).toBe(facts.entries[6]?.id ?? "missing");
    // Dated before the ledger went live (20 Oct): backfilled.
    expect(reversal?.cells[14]).toBe("Yes");
    const asset = sheet.rows.find((r) => r.cells[3] === "Asset");
    expect(asset?.cells[2]).toBe("Fixed assets");
    expect(asset?.cells[16]).toBe("Sewing machine");
  });

  it("summarises income and expenditure by head and programme, tying to the entries", () => {
    const facts = fixture();
    const totals = incomeExpenditureTotals(facts);
    expect(totals).toEqual({
      expensePaise: 2360,
      incomePaise: 133_700,
      surplusPaise: 131_340,
    });
    const rows = summarySheet(facts).rows;
    const find = (head: string, programme: string) =>
      rows.find((r) => r.cells[0] === head && r.cells[1] === programme)
        ?.cells[2];
    expect(find("Donations received", "Education")).toBe(1000);
    expect(find("Donations received", "Arts and culture")).toBe(300);
    expect(find("Interest on fixed deposit", "No programme")).toBe(37);
    expect(find("Total income", "All programmes")).toBe(1337);
    expect(find("Total expenditure", "All programmes")).toBe(23.6);
    expect(find("Income less expenditure (surplus)", "All programmes")).toBe(
      1313.4
    );
    expect(find("Income less expenditure", "Education")).toBe(976.4);

    // The I&E sheet's income and expense rows add up to the same surplus.
    const ie = incomeExpenditureSheet(facts).rows;
    const signed = ie.reduce((sum, r) => {
      if (r.cells[3] === "Income") {
        return sum + Number(r.cells[4]);
      }
      return r.cells[3] === "Expense" ? sum - Number(r.cells[4]) : sum;
    }, 0);
    expect(Math.round(signed * 100)).toBe(totals.surplusPaise);
  });

  it("balances, with cash closings equal to the receipts and payments", () => {
    const facts = fixture();
    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    const item = (name: string) =>
      sheet.rows.find((r) => r.cells[0] === name)?.cells ?? [];
    expect(item("Current account (Bank)")).toEqual([
      "Current account (Bank)",
      1000,
      1476.4,
      200,
      2276.4,
      2276.4,
      "2027-03-28",
    ]);
    expect(item("Fixed deposit (Fixed deposit)")[4]).toBe(2037);
    expect(item("Razorpay clearing (Clearing)")[4]).toBe(0);
    expect(item("Fixed assets: Sewing machine")[1]).toBe(50);
    expect(item("Corpus Fund")[4]).toBe(10);
    // Income less expenditure rolls into the General Fund, as the
    // statements' fund note: opening balance plus the year's surplus.
    expect(item("General Fund (Domestic): opening balance")).toEqual([
      "General Fund (Domestic): opening balance",
      2940,
      0,
      0,
      2940,
      null,
      null,
    ]);
    expect(
      item("General Fund (Domestic): current year surplus/(deficit)")
    ).toEqual([
      "General Fund (Domestic): current year surplus/(deficit)",
      0,
      // The summary's surplus: gifts and interest less the reclassification's
      // net nil, the refund and the fee.
      1313.4,
      0,
      1313.4,
      null,
      null,
    ]);
    expect(
      item("General Fund (Domestic): current year surplus/(deficit)")[4]
    ).toBe(incomeExpenditureTotals(facts).surplusPaise / 100);
    expect(item("General Fund (Domestic) total").slice(1, 5)).toEqual([
      2940, 1313.4, 0, 4253.4,
    ]);
    expect(
      sheet.rows.some((r) => String(r.cells[0]).startsWith("Income less"))
    ).toBe(false);
    expect(item("Total assets")[4]).toBe(4363.4);
    expect(item("Total funds and liabilities")[4]).toBe(4363.4);
    const checkRow = sheet.rows.at(-1)?.cells ?? [];
    expect(checkRow[0]).toContain("(balances)");
    expect(checkRow[4]).toBe(0);

    // Each account's closing here is its carried forward in the cash sheet.
    const randp = receiptsAndPaymentsSheet(facts).rows.filter(
      (r) => r.cells[3] === "Balance carried forward"
    );
    for (const account of facts.accounts) {
      const carried = randp.find((r) => r.cells[1] === account.name);
      const closing = sheet.rows.find((r) =>
        String(r.cells[0]).startsWith(`${account.name} (`)
      );
      expect(carried?.cells[4]).toBe(closing?.cells[4] ?? "missing");
    }
  });

  it("says when the books don't balance", () => {
    const facts = fixture();
    facts.entries.push(
      ...facts.entries.slice(0, 1).map((e) => ({ ...e, id: "extra" }))
    );
    const { check, sheet } = balanceSheet(facts);
    expect(check.closingDifferencePaise).toBe(5000);
    expect(sheet.rows.at(-1)?.cells[0]).toContain("does not balance");
  });

  it("flags entries dated before the ledger went live as backfilled, reversals as their original", () => {
    const facts = fixture();
    const late = (partial: Partial<WorkbookEntry>) =>
      entry("donations", {
        amountPaise: 100,
        economicOn: "2026-11-01",
        sourceId: "gift-late",
        sourceType: "contribution",
        ...partial,
      });
    // A gift captured 31 Mar and paid out 1 Apr posts on 1 Apr: before go-live.
    const payoutDay = late({ economicOn: "2026-04-01" });
    const afterGoLive = late({ economicOn: "2026-10-25" });
    const monthEnd = late({ economicOn: "2027-03-31", postedOn: "2027-04-01" });
    const reversal = late({
      economicOn: "2026-10-25",
      effect: "decrease",
      postedOn: "2027-01-15",
      reversesEntryId: afterGoLive.id,
    });
    const flags = backfilledFlags(
      [...facts.entries, payoutDay, afterGoLive, monthEnd, reversal],
      "2026-10-20"
    );
    expect(flags.get(payoutDay.id)).toBe(true);
    expect(flags.get(afterGoLive.id)).toBe(false);
    // Posted after its month ended but dated after go-live: not backfilled.
    expect(flags.get(monthEnd.id)).toBe(false);
    expect(flags.get(reversal.id)).toBe(false);
    // Until the opening balances are posted, nothing is backfilled.
    expect(
      [...backfilledFlags([payoutDay], null).values()].every((f) => !f)
    ).toBe(true);
  });

  it("nets an opening reversal and repost into the same items", () => {
    const facts = fixture();
    const ob2 = { sourceId: "ob-2", sourceType: "opening_balance" };
    const original = facts.entries[0];
    if (!original) {
      throw new Error("fixture");
    }
    // The opening asset line reversed and posted again at 60.
    facts.entries.push(
      {
        ...original,
        effect: "decrease",
        id: "ent-rev",
        reversesEntryId: original.id,
      },
      entry("fixedAssets", {
        ...ob2,
        amountPaise: 6000,
        economicOn: "2026-04-01",
        memo: "Sewing machine",
      }),
      entry("fund", { ...ob2, amountPaise: 1000, economicOn: "2026-04-01" })
    );
    const { check, sheet } = balanceSheet(facts);
    const rows = sheet.rows.filter((r) =>
      String(r.cells[0]).startsWith("Fixed assets")
    );
    expect(rows.map((r) => r.cells.slice(0, 5))).toEqual([
      ["Fixed assets: Sewing machine", 60, 0, 0, 60],
    ]);
    expect(check.closingDifferencePaise).toBe(0);
  });

  it("keeps later fixed-asset entries apart from the opening asset lines", () => {
    const facts = fixture();
    facts.entries.push(
      entry("fixedAssets", {
        amountPaise: 1000,
        economicOn: "2027-03-31",
        effect: "decrease",
        memo: "Depreciation",
        sourceId: "adj-1",
        sourceType: "adjustment",
      }),
      entry("fund", {
        amountPaise: 1000,
        economicOn: "2027-03-31",
        effect: "decrease",
        sourceId: "adj-1",
        sourceType: "adjustment",
      })
    );
    const { check, sheet } = balanceSheet(facts);
    const other = sheet.rows.find((r) => r.cells[0] === "Fixed assets — other");
    expect(other?.cells.slice(1, 5)).toEqual([0, 0, 10, -10]);
    expect(check.closingDifferencePaise).toBe(0);
  });

  it("shows a movement reversal and its repost, netting in the balance", () => {
    const facts = fixture();
    const g2Receipt = facts.movements.find(
      (m) => m.sourceId === "gift-2" && m.kind === "receipt"
    );
    if (!g2Receipt) {
      throw new Error("fixture");
    }
    facts.movements.push(
      {
        ...g2Receipt,
        direction: "out",
        id: "mov-9998",
        occurredOn: "2026-05-20",
        reversesMovementId: g2Receipt.id,
      },
      { ...g2Receipt, amountPaise: 45_000, id: "mov-9999" }
    );
    // The entries follow the corrected amount.
    facts.entries.push(
      entry("donations", {
        amountPaise: 5000,
        economicOn: "2026-05-20",
        effect: "decrease",
        programmeId: "p-arts",
        programmeName: "Arts and culture",
        sourceId: "gift-2",
        sourceType: "contribution",
      })
    );
    const bank = receiptsAndPaymentsSheet(facts).rows.filter(
      (r) => r.cells[1] === "Current account"
    );
    expect(bank.map((r) => r.cells[3])).toContain("Receipt (reversal)");
    expect(bank.at(-1)?.cells[4]).toBe(2226.4);
    expect(balanceSheet(facts).check.closingDifferencePaise).toBe(0);
  });

  it("names a vendor payment's payout from the supplier advance it makes", () => {
    const facts = fixture();
    const paid = {
      sourceId: "vpt-1",
      sourceType: "vendor_payment_transaction",
    };
    facts.movements.push(
      movement({
        ...paid,
        amountPaise: 10_000,
        direction: "out",
        kind: "payout",
        occurredOn: "2026-07-10",
        orgAccountId: BANK,
      })
    );
    facts.entries.push(
      entry("advances", {
        ...paid,
        amountPaise: 10_000,
        economicOn: "2026-07-10",
        partyName: "Sharma Travels",
      })
    );
    const payout = receiptsAndPaymentsSheet(facts).rows.find(
      (r) => r.cells[3] === "Payout"
    );
    expect(payout?.cells[5]).toBe("Sharma Travels");
    expect(payout?.cells[9]).toBe("Supplier advances");
  });

  it("carries a later year forward from summed earlier rows", () => {
    const facts = fixture();
    // FY 2027-28, with FY 2026-27 summed as brought-forward rows the day before.
    const bfOn = "2027-03-31";
    const prior = fixture();
    const sums = new Map<string, number>();
    for (const m of prior.movements) {
      sums.set(
        m.orgAccountId,
        (sums.get(m.orgAccountId) ?? 0) +
          (m.direction === "in" ? m.amountPaise : -m.amountPaise)
      );
    }
    facts.year = {
      closed: false,
      endsOn: "2028-03-31",
      id: "fy2",
      label: "2027-28",
      startsOn: "2027-04-01",
    };
    facts.movements = [...sums]
      .filter(([, paise]) => paise !== 0)
      .map(([account, paise]) =>
        movement({
          amountPaise: Math.abs(paise),
          direction: paise > 0 ? "in" : "out",
          kind: "opening",
          occurredOn: bfOn,
          orgAccountId: account,
          sourceId: account,
          sourceType: "brought_forward",
        })
      );
    facts.movements.push(
      movement({
        amountPaise: 10_000,
        direction: "in",
        kind: "receipt",
        occurredOn: "2027-05-01",
        orgAccountId: BANK,
        sourceId: "gift-3",
        sourceType: "contribution",
      })
    );
    facts.entries = [
      ...prior.entries.map((e) => ({
        ...e,
        economicOn: e.economicOn < "2027-04-01" ? bfOn : e.economicOn,
        reversesEntryId: null,
        sourceType:
          e.sourceType === "opening_balance" ? e.sourceType : "brought_forward",
      })),
      entry("donations", {
        amountPaise: 10_000,
        economicOn: "2027-05-01",
        sourceId: "gift-3",
        sourceType: "contribution",
      }),
    ];
    const randp = receiptsAndPaymentsSheet(facts).rows.filter(
      (r) => r.cells[1] === "Current account"
    );
    expect(randp.map((r) => r.cells[3])).toEqual([
      "Balance brought forward",
      "Receipt",
      "Balance carried forward",
    ]);
    expect(randp[0]?.cells[4]).toBe(2276.4);
    expect(randp.at(-1)?.cells[4]).toBe(2376.4);
    expect(incomeExpenditureSheet(facts).rows).toHaveLength(1);
    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    const fundRow = (name: string) =>
      sheet.rows.find((r) => r.cells[0] === name)?.cells.slice(1, 5);
    // FY 2026-27's surplus is part of the General Fund's opening now; the
    // year's own surplus is its increase.
    expect(fundRow("General Fund (Domestic): opening balance")).toEqual([
      4253.4, 0, 0, 4253.4,
    ]);
    expect(
      fundRow("General Fund (Domestic): current year surplus/(deficit)")
    ).toEqual([0, 100, 0, 100]);
    expect(fundRow("General Fund (Domestic) total")).toEqual([
      4253.4, 100, 0, 4353.4,
    ]);
    expect(fundRow("Corpus Fund")).toEqual([10, 0, 0, 10]);
    expect(
      sheet.rows.find((r) => r.cells[0] === "Fixed assets: Sewing machine")
        ?.cells[1]
    ).toBe(50);
  });

  it("rolls a deficit into the General Fund in the following year", () => {
    const facts = nextYear(fixture());
    // FY 2027-28 spends 500 and receives nothing.
    facts.entries.push(
      entry("charges", {
        amountPaise: 50_000,
        economicOn: "2027-06-01",
        sourceId: "fee-9",
        sourceType: "gateway_settlement",
      })
    );
    facts.movements.push(
      movement({
        amountPaise: 50_000,
        direction: "out",
        kind: "fee",
        occurredOn: "2027-06-01",
        orgAccountId: BANK,
        sourceId: "fee-9",
        sourceType: "gateway_settlement",
      })
    );
    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    expect(incomeExpenditureTotals(facts).surplusPaise).toBe(-50_000);
    expect(
      fundRowOf(sheet, "General Fund (Domestic): opening balance")
    ).toEqual([4253.4, 0, 0, 4253.4]);
    expect(
      fundRowOf(
        sheet,
        "General Fund (Domestic): current year surplus/(deficit)"
      )
    ).toEqual([0, 0, 500, -500]);
    expect(fundRowOf(sheet, "General Fund (Domestic) total")).toEqual([
      4253.4, 0, 500, 3753.4,
    ]);
  });

  it("credits a corpus gift to the Corpus Fund as an addition of the year, never income", () => {
    const facts = withCorpusGift(fixture());
    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    expect(fundRowOf(sheet, "Corpus Fund: opening balance")).toEqual([
      10, 0, 0, 10,
    ]);
    expect(
      fundRowOf(sheet, "Corpus Fund: additions/(deductions) during the year")
    ).toEqual([0, 200, 0, 200]);
    expect(fundRowOf(sheet, "Corpus Fund total")).toEqual([10, 200, 0, 210]);
    // The General Fund keeps only its own surplus.
    expect(fundRowOf(sheet, "General Fund (Domestic) total")).toEqual([
      2940, 1313.4, 0, 4253.4,
    ]);
    // Not income: the I&E surplus is the General Fund's alone.
    expect(incomeExpenditureTotals(facts).surplusPaise).toBe(131_340);
    const summary = summarySheet(facts).rows;
    expect(summary.find((r) => r.cells[0] === "Total income")?.cells[2]).toBe(
      1337
    );
    expect(
      summary.find((r) => r.cells[0] === "Corpus donations (Corpus Fund)")
        ?.cells[2]
    ).toBe(200);
    // The receipt names the donor and the corpus head.
    const receipt = receiptsAndPaymentsSheet(facts).rows.find((r) =>
      String(r.cells[10]).endsWith("gift-corpus")
    );
    expect(receipt?.cells[5]).toBe("Meera Iyer");
    expect(receipt?.cells[9]).toBe("Corpus donations");

    // The next year opens the Corpus Fund with the gift.
    const next = balanceSheet(nextYear(withCorpusGift(fixture())));
    expect(next.check.openingDifferencePaise).toBe(0);
    expect(next.check.closingDifferencePaise).toBe(0);
    expect(fundRowOf(next.sheet, "Corpus Fund: opening balance")).toEqual([
      210, 0, 0, 210,
    ]);
    expect(
      fundRowOf(
        next.sheet,
        "Corpus Fund: additions/(deductions) during the year"
      )
    ).toEqual([0, 0, 0, 0]);
    expect(fundRowOf(next.sheet, "Corpus Fund total")).toEqual([
      210, 0, 0, 210,
    ]);
    expect(fundRowOf(next.sheet, "General Fund (Domestic) total")).toEqual([
      4253.4, 0, 0, 4253.4,
    ]);
  });

  it("labels the audited figures' year-end adjustments, keeps depreciation on its asset, and opens the next year at them", () => {
    const facts = fixture();
    const af = { sourceId: "af-1", sourceType: "audited_figures" };
    const yearEnd = "2027-03-31";
    facts.auditedFigures.set("af-1", {
      caName: "Test CA LLP",
      reversed: false,
      signedOn: "2027-09-30",
    });
    // Depreciation of 20 on the sewing machine, the audit fee of 100 written back.
    facts.entries.push(
      entry("fixedAssets", {
        ...af,
        amountPaise: 2000,
        economicOn: yearEnd,
        effect: "decrease",
        memo: "Sewing machine",
      }),
      entry("depreciation", {
        ...af,
        amountPaise: 2000,
        economicOn: yearEnd,
        memo: "Per audited accounts: Sewing machine",
      }),
      entry("payable", {
        ...af,
        amountPaise: 10_000,
        economicOn: yearEnd,
        effect: "decrease",
      }),
      entry("adjustments", {
        ...af,
        amountPaise: 10_000,
        economicOn: yearEnd,
        effect: "decrease",
      })
    );
    const { check, sheet } = balanceSheet(facts);
    expect(check.closingDifferencePaise).toBe(0);
    expect(fundRowOf(sheet, "Fixed assets: Sewing machine")).toEqual([
      50, 0, 20, 30,
    ]);
    expect(sheet.rows.some((r) => r.cells[0] === "Fixed assets — other")).toBe(
      false
    );
    expect(fundRowOf(sheet, "Audit fees payable")).toEqual([100, 0, 100, 0]);
    expect(
      incomeExpenditureSheet(facts).rows.find(
        (r) => r.cells[2] === "Depreciation"
      )?.cells[12]
    ).toBe(
      "Year-end adjustments per audited accounts, signed 30-09-2027 by Test CA LLP (Audited figures af-1)"
    );
    const summary = summarySheet(facts).rows;
    const heading = summary.findIndex(
      (r) =>
        r.cells[0] ===
        "Year-end adjustments per audited accounts, signed 30-09-2027 by Test CA LLP (included above)"
    );
    expect(heading).toBeGreaterThan(0);
    expect(summary[heading + 1]?.cells).toEqual([
      "Depreciation (expenditure)",
      "All programmes",
      20,
    ]);
    expect(summary[heading + 2]?.cells).toEqual([
      "Year-end adjustments (audited) (expenditure)",
      "All programmes",
      -100,
    ]);
    expect(summary[heading + 3]?.cells).toEqual([
      "Effect on the surplus",
      "All programmes",
      80,
    ]);

    // The next year opens at the audited figures.
    const next = balanceSheet(nextYear(facts));
    expect(next.check.openingDifferencePaise).toBe(0);
    expect(fundRowOf(next.sheet, "Fixed assets: Sewing machine")).toEqual([
      30, 0, 0, 30,
    ]);
    expect(fundRowOf(next.sheet, "Audit fees payable")).toEqual([0, 0, 0, 0]);
    expect(fundRowOf(next.sheet, "General Fund (Domestic) total")?.[0]).toBe(
      4253.4 + 80
    );
  });

  it("leaves out a fund that is zero throughout", () => {
    const facts = fixture();
    const ob = { sourceId: "ob-1", sourceType: "opening_balance" };
    const line = entry("fund", {
      ...ob,
      amountPaise: 500,
      economicOn: "2026-04-01",
      fundId: "f-empty",
      fundName: "Empty Fund",
    });
    facts.entries.push(line, {
      ...line,
      effect: "decrease",
      id: "ent-empty-rev",
      reversesEntryId: line.id,
    });
    const { check, sheet } = balanceSheet(facts);
    expect(
      sheet.rows.some((r) => String(r.cells[0]).startsWith("Empty Fund"))
    ).toBe(false);
    expect(check.closingDifferencePaise).toBe(0);
  });

  it("carries a surplus across a year with no entries", () => {
    const facts = nextYear(fixture());
    facts.year = {
      closed: false,
      endsOn: "2029-03-31",
      id: "fy3",
      label: "2028-29",
      startsOn: "2028-04-01",
    };
    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    expect(fundRowOf(sheet, "General Fund (Domestic) total")).toEqual([
      4253.4, 0, 0, 4253.4,
    ]);
    expect(
      fundRowOf(
        sheet,
        "General Fund (Domestic): current year surplus/(deficit)"
      )
    ).toEqual([0, 0, 0, 0]);
  });

  it("rolls posted expenses into the General Fund, reversals and supplier advances netting", () => {
    const facts = fixture();
    const travel = {
      accountHeadId: "h-travel",
      headName: "Travel",
      headType: "expense",
    } as const;
    // An approved reimbursement of 425, reversed and reposted when its
    // claimant changed (same money, a new payee on the payout).
    const claim = { sourceId: "claim-1", sourceType: "reimbursement" };
    const recognised = entry("charges", {
      ...claim,
      ...travel,
      amountPaise: 42_500,
      economicOn: "2026-06-03",
    });
    const paid = movement({
      ...claim,
      amountPaise: 42_500,
      direction: "out",
      kind: "payout",
      memo: "Class outing (paid to Ravi)",
      occurredOn: "2026-06-03",
      orgAccountId: BANK,
    });
    facts.entries.push(
      recognised,
      {
        ...recognised,
        effect: "decrease",
        id: "ent-claim-rev",
        reversesEntryId: recognised.id,
      },
      { ...recognised, id: "ent-claim-repost" }
    );
    facts.movements.push(
      paid,
      {
        ...paid,
        direction: "in",
        id: "mov-claim-rev",
        reversesMovementId: paid.id,
      },
      { ...paid, id: "mov-claim-repost", memo: "Class outing (paid to Meena)" }
    );
    // A vendor paid 250 before its invoice (a supplier advance), then the
    // accepted invoice recognises the expense and clears the advance.
    const payment = {
      sourceId: "vpt-2",
      sourceType: "vendor_payment_transaction",
    };
    const invoice = { sourceId: "vp-2", sourceType: "vendor_payment" };
    facts.movements.push(
      movement({
        ...payment,
        amountPaise: 25_000,
        direction: "out",
        kind: "payout",
        occurredOn: "2026-07-10",
        orgAccountId: BANK,
      })
    );
    facts.entries.push(
      entry("advances", {
        ...payment,
        amountPaise: 25_000,
        economicOn: "2026-07-10",
        partyName: "Sharma Travels",
      }),
      entry("charges", {
        ...invoice,
        ...travel,
        amountPaise: 25_000,
        economicOn: "2026-07-20",
        partyName: "Sharma Travels",
      }),
      entry("advances", {
        ...invoice,
        amountPaise: 25_000,
        economicOn: "2026-07-20",
        effect: "decrease",
        partyName: "Sharma Travels",
      })
    );

    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    // 1,313.40 of surplus less 675 of expenses.
    expect(
      fundRowOf(
        sheet,
        "General Fund (Domestic): current year surplus/(deficit)"
      )
    ).toEqual([0, 638.4, 0, 638.4]);
    expect(fundRowOf(sheet, "General Fund (Domestic) total")).toEqual([
      2940, 638.4, 0, 3578.4,
    ]);
    // The cleared advance leaves no supplier advances standing.
    expect(fundRowOf(sheet, "Supplier advances — other")).toEqual([
      0, 250, 250, 0,
    ]);
    const books = toBooks(facts);
    expect(books.balanced).toBe(true);
    expect(books.funds.find((f) => f.key === GENERAL_FUND_ID)).toMatchObject({
      movement: { openingPaise: 294_000, surplusPaise: 63_840 },
      paise: 357_840,
    });

    // The next year opens the General Fund with the surplus after expenses.
    const next = nextYear(facts);
    const following = balanceSheet(next);
    expect(following.check.openingDifferencePaise).toBe(0);
    expect(following.check.closingDifferencePaise).toBe(0);
    expect(
      fundRowOf(following.sheet, "General Fund (Domestic): opening balance")
    ).toEqual([3578.4, 0, 0, 3578.4]);
    expect(toBooks(next).balanced).toBe(true);
  });

  it("agrees with the Books balance summary on every fund", () => {
    const cases = [
      withCorpusGift(fixture()),
      nextYear(withCorpusGift(fixture())),
    ];
    for (const facts of cases) {
      const { sheet } = balanceSheet(facts);
      const books = toBooks(facts);
      expect(books.balanced).toBe(true);
      const names = new Map([
        [GENERAL_FUND_ID, "General Fund (Domestic)"],
        ["f-corpus", "Corpus Fund"],
      ]);
      for (const line of books.funds) {
        const name = names.get(line.key) ?? "";
        const total = fundRowOf(sheet, `${name} total`) ?? [];
        const opening = fundRowOf(sheet, `${name}: opening balance`) ?? [];
        const year = sheet.rows
          .find(
            (r) =>
              String(r.cells[0]).startsWith(`${name}: `) &&
              r.cells[0] !== `${name}: opening balance`
          )
          ?.cells.slice(1, 5);
        expect(line.movement).toBeDefined();
        expect(Math.round(Number(total[3]) * 100)).toBe(line.paise);
        expect(Math.round(Number(opening[3]) * 100)).toBe(
          line.movement?.openingPaise ?? Number.NaN
        );
        // The General Fund's year is its surplus; another fund's, its
        // capital receipts (corpus gifts) with any surplus posted to it.
        expect(Math.round(Number(year?.[3]) * 100)).toBe(
          line.key === GENERAL_FUND_ID
            ? (line.movement?.surplusPaise ?? Number.NaN)
            : (line.movement?.additionsPaise ?? Number.NaN) +
                (line.movement?.surplusPaise ?? Number.NaN)
        );
      }
    }
  });
});

describe("corpus gifts in the CA workbook", () => {
  /** A 1,000 corpus gift through Razorpay with a 23.60 fee, 100 of it refunded. */
  function withRazorpayCorpusGift(facts: WorkbookFacts): WorkbookFacts {
    const src = { sourceId: "gift-rzp-corpus", sourceType: "contribution" };
    const ref = { sourceId: "ref-corpus", sourceType: "contribution_refund" };
    const corpus = { fundId: "f-corpus", fundName: "Corpus Fund" };
    facts.entries.push(
      entry("corpus", {
        ...src,
        ...corpus,
        amountPaise: 100_000,
        economicOn: "2026-09-01",
      }),
      // The fee is General Fund expenditure.
      entry("charges", { ...src, amountPaise: 2360, economicOn: "2026-09-01" }),
      entry("corpus", {
        ...ref,
        ...corpus,
        amountPaise: 10_000,
        economicOn: "2026-10-01",
        effect: "decrease",
      })
    );
    facts.movements.push(
      movement({
        ...src,
        amountPaise: 100_000,
        direction: "in",
        kind: "receipt",
        occurredOn: "2026-09-01",
        orgAccountId: CLEARING,
      }),
      movement({
        ...src,
        amountPaise: 2360,
        direction: "out",
        kind: "fee",
        occurredOn: "2026-09-01",
        orgAccountId: CLEARING,
      }),
      movement({
        ...ref,
        amountPaise: 10_000,
        direction: "out",
        kind: "refund",
        occurredOn: "2026-10-01",
        orgAccountId: CLEARING,
      })
    );
    return facts;
  }

  it("keeps the gross in the Corpus Fund and the fee in the General Fund's I&E", () => {
    const facts = withRazorpayCorpusGift(fixture());
    const totals = incomeExpenditureTotals(facts);
    // The fixture's income alone; its expenditure plus the corpus gift's fee.
    expect(totals).toEqual({
      expensePaise: 2360 + 2360,
      incomePaise: 133_700,
      surplusPaise: 131_340 - 2360,
    });
    const { check, sheet } = balanceSheet(facts);
    expect(check.openingDifferencePaise).toBe(0);
    expect(check.closingDifferencePaise).toBe(0);
    expect(
      fundRowOf(sheet, "Corpus Fund: additions/(deductions) during the year")
    ).toEqual([0, 1000, 100, 900]);
    expect(fundRowOf(sheet, "Corpus Fund total")).toEqual([10, 1000, 100, 910]);
    expect(
      fundRowOf(
        sheet,
        "General Fund (Domestic): current year surplus/(deficit)"
      )
    ).toEqual([0, 1289.8, 0, 1289.8]);
    // The I&E summary lists the gift apart, net of its refund.
    expect(
      summarySheet(facts).rows.find(
        (r) => r.cells[0] === "Corpus donations (Corpus Fund)"
      )?.cells[2]
    ).toBe(900);
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

describe("CA workbook over random ledgers", () => {
  const YEARS = [
    {
      closed: false,
      endsOn: "2027-03-31",
      id: "y1",
      label: "2026-27",
      startsOn: "2026-04-01",
    },
    {
      closed: false,
      endsOn: "2028-03-31",
      id: "y2",
      label: "2027-28",
      startsOn: "2027-04-01",
    },
    {
      closed: false,
      endsOn: "2029-03-31",
      id: "y3",
      label: "2028-29",
      startsOn: "2028-04-01",
    },
    {
      closed: false,
      endsOn: "2030-03-31",
      id: "y4",
      label: "2029-30",
      startsOn: "2029-04-01",
    },
  ];
  const FUNDS = {
    corpus: { fundId: "f-corpus", fundName: "Corpus Fund" },
    general: { fundId: GENERAL_FUND_ID, fundName: "General Fund (Domestic)" },
  };

  /**
   * The fixture's opening balances, then four years of gifts (income, or
   * corpus gifts credited to the Corpus Fund), their gateway fees (General
   * Fund), refunds and spending, each with its money.
   */
  function randomFacts(seed: number): WorkbookFacts {
    const rand = seeded(seed);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(rand() * list.length)] as T;
    const facts = fixture();
    facts.entries = facts.entries.filter(
      (e) => e.sourceType === "opening_balance"
    );
    facts.movements = facts.movements.filter((m) => m.kind === "opening");
    for (let i = 0; i < 30; i += 1) {
      const year = pick(YEARS);
      const start = Date.parse(`${year.startsOn}T00:00:00Z`);
      const on = new Date(start + Math.floor(rand() * 365) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const paise = 1 + Math.floor(rand() * 100_000);
      const src = { sourceId: `src-${seed}-${i}`, sourceType: "contribution" };
      const account = pick([BANK, CLEARING]);
      const money = (
        direction: "in" | "out",
        kind: WorkbookMovement["kind"],
        amountPaise: number
      ) =>
        facts.movements.push(
          movement({
            ...src,
            amountPaise,
            direction,
            kind,
            occurredOn: on,
            orgAccountId: account,
          })
        );
      const kind = pick(["gift", "corpus", "spend"] as const);
      if (kind === "spend") {
        facts.entries.push(
          entry("charges", { ...src, amountPaise: paise, economicOn: on })
        );
        money("out", "fee", paise);
        continue;
      }
      const head = kind === "corpus" ? "corpus" : "donations";
      const fund =
        kind === "corpus" ? FUNDS.corpus : pick([FUNDS.general, FUNDS.corpus]);
      facts.entries.push(
        entry(head, { ...src, ...fund, amountPaise: paise, economicOn: on })
      );
      money("in", "receipt", paise);
      if (rand() < 0.5) {
        const fee = Math.ceil(paise / 50);
        facts.entries.push(
          entry("charges", { ...src, amountPaise: fee, economicOn: on })
        );
        money("out", "fee", fee);
      }
      if (rand() < 0.2) {
        const refund = Math.ceil(paise / 4);
        facts.entries.push(
          entry(head, {
            ...src,
            ...fund,
            amountPaise: refund,
            economicOn: on,
            effect: "decrease",
          })
        );
        money("out", "refund", refund);
      }
    }
    return facts;
  }

  it("balances every year of 200 ledgers and agrees with the Books on every fund", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const all = randomFacts(seed);
      for (const year of YEARS) {
        const facts = { ...all, year };
        const { check, sheet } = balanceSheet(facts);
        expect(check.openingDifferencePaise, `seed ${seed}`).toBe(0);
        expect(check.closingDifferencePaise, `seed ${seed}`).toBe(0);
        const books = balanceSummary({
          accountIds: facts.accounts.map((a) => a.id),
          asOf: year.endsOn,
          entries: facts.entries.map((e) => ({
            accountHeadId: e.accountHeadId,
            amountPaise: e.amountPaise,
            economicOn: e.economicOn,
            effect: e.effect,
            fundId: e.fundId,
            headType: e.headType,
            id: e.id,
            programmeId: e.programmeId,
          })),
          movements: facts.movements,
          startsOn: year.startsOn,
        });
        expect(books.differencePaise, `seed ${seed}`).toBe(0);
        let surplus = 0;
        for (const line of books.funds) {
          const name =
            line.key === GENERAL_FUND_ID
              ? FUNDS.general.fundName
              : FUNDS.corpus.fundName;
          const total =
            fundRowOf(sheet, `${name} total`) ?? fundRowOf(sheet, name) ?? [];
          expect(Math.round(Number(total[3] ?? 0) * 100), `seed ${seed}`).toBe(
            line.paise
          );
          surplus += line.movement?.surplusPaise ?? 0;
        }
        // Corpus gifts are no income: the funds' surpluses are the I&E's.
        expect(surplus, `seed ${seed}`).toBe(
          incomeExpenditureTotals(facts).surplusPaise
        );
      }
    }
  });
});

const gift = (overrides: Partial<AllGiftsRow> = {}): AllGiftsRow => ({
  amountPaise: 100_000,
  channel: "UPI",
  contributionId: "gift-2",
  deductionEligible: "Eligible",
  donationType: "Corpus",
  donor: "Ravi Kumar",
  id: "PAN ending 234F",
  netPaise: 80_000,
  reason: "",
  receiptIssuer: "Proud Indian",
  receiptNumber: "PI/2026-27/0001",
  receivedOn: "2026-05-20",
  refundedPaise: 20_000,
  reportingMode: "Electronic",
  status: "Ready",
  ...overrides,
});

describe("donor list", () => {
  it("lists the return's all-gifts columns with the ID masked and the receipt", () => {
    const sheet = donorSheet([gift()]);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "Received on",
      "Donor",
      "ID (last 4)",
      "Amount (INR)",
      "Refunded (INR)",
      "Net (INR)",
      "Channel",
      "Mode of receipt",
      "Donation type",
      "Tax certificate",
      "Status",
      "Reason",
      "Receipt issued by",
      "Receipt number",
      "Contribution ID",
    ]);
    const cells = sheet.rows[0]?.cells ?? [];
    expect(cells[2]).toBe("PAN ending 234F");
    expect(cells.slice(3, 6)).toEqual([1000, 200, 800]);
    expect(cells.slice(12, 14)).toEqual(["Proud Indian", "PI/2026-27/0001"]);
  });

  it("is a one-line note for someone who may not see donors", () => {
    const sheet = withheldDonorSheet();
    expect(sheet.name).toBe("Donor list (Form 113)");
    expect(sheet.rows).toHaveLength(1);
    expect(String(sheet.rows[0]?.cells[0])).toContain("donor permission");
  });
});

describe("XLSX cells", () => {
  const textColumn = { header: "T", kind: "text", width: 10 } as const;

  it("writes amounts as INR numbers and dates as Excel dates", () => {
    expect(
      toCell(1234.5, { header: "A", kind: "amount", width: 10 })
    ).toMatchObject({ format: INR_FORMAT, type: Number, value: 1234.5 });
    const date = toCell("2026-05-20", { header: "D", kind: "date", width: 10 });
    expect(date).toMatchObject({ format: DATE_FORMAT, type: Date });
    expect((date as { value: Date }).value.toISOString()).toBe(
      "2026-05-20T00:00:00.000Z"
    );
    expect(excelDate("2027-03-31").getUTCDate()).toBe(31);
    expect(toCell(null, textColumn)).toBeNull();
    expect(toCell("", textColumn)).toBeNull();
  });

  it("guards text a spreadsheet could run as a formula", () => {
    for (const raw of ["=1+1", "+91", "-5", "@SUM(A1)", "\tx", "\rx"]) {
      expect(guardText(raw)).toBe(`'${raw}`);
    }
    expect(guardText("Asha Rao")).toBe("Asha Rao");
    expect(guardText("PI/2026-27/0001")).toBe("PI/2026-27/0001");
    expect(toCell("=HYPERLINK(1)", textColumn)).toMatchObject({
      type: String,
      value: "'=HYPERLINK(1)",
    });
  });

  it("writes a workbook that reads back with five sheets, bold frozen headers, numbers and dates", async () => {
    const facts = fixture();
    const sheets = [
      receiptsAndPaymentsSheet(facts),
      incomeExpenditureSheet(facts),
      summarySheet(facts),
      balanceSheet(facts).sheet,
      donorSheet([gift()]),
    ];
    const buffer = await writeWorkbook(sheets);
    const read = await readXlsxFile(buffer);
    expect(read.map((s) => s.sheet)).toEqual([
      "Receipts and payments",
      "Income and expenditure",
      "Income and expenditure summary",
      "Balance sheet items",
      "Donor list (Form 113)",
    ]);
    const randp = read[0]?.data ?? [];
    expect(randp[0]?.[0]).toBe("Date");
    const firstMovement = randp[2] ?? [];
    expect(firstMovement[0]).toBeInstanceOf(Date);
    expect(typeof firstMovement[4]).toBe("number");
    expect(randp.some((row) => row[6] === "'=HYPERLINK(1)")).toBe(true);

    const files = unzipSync(new Uint8Array(buffer));
    const sheetXml = strFromU8(
      files["xl/worksheets/sheet1.xml"] ?? new Uint8Array()
    );
    expect(sheetXml).toContain('ySplit="1"');
    expect(sheetXml).toContain('state="frozen"');
    const styles = strFromU8(files["xl/styles.xml"] ?? new Uint8Array());
    expect(styles).toContain("<b/>");
  });
});
