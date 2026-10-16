import type {
  WorkbookAccount,
  WorkbookEntry,
  WorkbookFacts,
  WorkbookMovement,
} from "@pi-dash/db/queries/ca-workbook";
import { assetLineMemo } from "@pi-dash/shared/audited-figures";
import {
  CAPITAL_RECEIPT_HEAD_IDS,
  GENERAL_FUND_ID,
} from "@pi-dash/shared/constants";
import {
  LEDGER_SOURCE_LABELS,
  LEDGER_SOURCE_TYPES,
  MOVEMENT_KIND_LABELS,
  movementSignedPaise,
  signedPaise,
  surplusPaiseOf,
} from "@pi-dash/shared/ledger";
import { paiseToRupees } from "@pi-dash/shared/money";

import type { AllGiftsRow } from "@/lib/donations-return-export";

/**
 * The CA handoff workbook's sheets (finance-ledger-cutover.md section 5),
 * built from the books as pure data: one sheet per export, the contract's
 * columns in its order (ID and memo columns are appended where a row needs
 * them). Text cells hold strings, date cells "yyyy-MM-dd", amount cells
 * rupees as numbers; `xlsx.ts` writes them as text, Excel dates and INR
 * numbers. Everything is grouped by ID; names are only labels.
 */

export type ColumnKind = "text" | "date" | "amount";
export type CellValue = string | number | null;

export interface WorkbookColumn {
  header: string;
  kind: ColumnKind;
  width: number;
}

export interface WorkbookRow {
  /** Totals and balance rows. */
  bold?: boolean;
  cells: CellValue[];
}

export interface WorkbookSheet {
  columns: WorkbookColumn[];
  name: string;
  rows: WorkbookRow[];
}

export const SHEET_NAMES = {
  balanceSheet: "Balance sheet items",
  donors: "Donor list (Form 113)",
  incomeExpenditure: "Income and expenditure",
  receiptsPayments: "Receipts and payments",
  summary: "Income and expenditure summary",
} as const;

const text = (header: string, width = 18): WorkbookColumn => ({
  header,
  kind: "text",
  width,
});
const day = (header: string): WorkbookColumn => ({
  header,
  kind: "date",
  width: 12,
});
const amount = (header: string): WorkbookColumn => ({
  header,
  kind: "amount",
  width: 16,
});

export const rupees = (paise: number) => Number(paiseToRupees(paise));

const sourceLabel = (sourceType: string) =>
  (LEDGER_SOURCE_LABELS as Record<string, string>)[sourceType] ??
  sourceType.replaceAll("_", " ");

/** "Contribution 0190…": the pi-dash document a row came from. */
export const documentReference = (sourceType: string, sourceId: string) =>
  `${sourceLabel(sourceType)} ${sourceId}`;

/** "30-09-2027" from "2027-09-30". */
const dayText = (iso: string) => iso.split("-").reverse().join("-");

/** How the CA's year-end corrections are named in the workbook. */
export const AUDITED_ADJUSTMENTS_LABEL =
  "Year-end adjustments per audited accounts";

/** "Year-end adjustments per audited accounts, signed 30-09-2027 by GVNKA & Associates". */
export function auditedAdjustmentsTitle(
  document: { caName: string | null; signedOn: string | null } | undefined
): string {
  if (!(document?.signedOn && document.caName)) {
    return AUDITED_ADJUSTMENTS_LABEL;
  }
  return `${AUDITED_ADJUSTMENTS_LABEL}, signed ${dayText(document.signedOn)} by ${document.caName}`;
}

/**
 * An entry's document: its type and reference, and for the audited figures
 * what they are, when and by whom they were signed.
 */
function entryReference(
  e: Pick<WorkbookEntry, "sourceId" | "sourceType">,
  facts: Pick<WorkbookFacts, "auditedFigures">
): string {
  const reference = documentReference(e.sourceType, e.sourceId);
  if (e.sourceType !== LEDGER_SOURCE_TYPES.auditedFigures) {
    return reference;
  }
  return `${auditedAdjustmentsTitle(facts.auditedFigures.get(e.sourceId))} (${reference})`;
}

const ACCOUNT_KIND_LABELS: Record<WorkbookAccount["kind"], string> = {
  bank: "Bank",
  cash: "Cash",
  deposit: "Fixed deposit",
  gateway_clearing: "Clearing",
};

const HEAD_TYPE_LABELS: Record<WorkbookEntry["headType"], string> = {
  asset: "Asset",
  expense: "Expense",
  fund: "Fund",
  income: "Income",
  liability: "Liability",
};

const inYear = (iso: string, facts: Pick<WorkbookFacts, "year">) =>
  iso >= facts.year.startsOn && iso <= facts.year.endsOn;

const byLabel = <T extends { label: string }>(a: T, b: T) =>
  a.label.localeCompare(b.label);

// ── Backfilled ──────────────────────────────────────────────────────────────

/**
 * Backfilled: the entry's economic date is before the day the ledger went
 * live (the posting day of the cutover year's first opening balances), so
 * it was recorded after the fact. "No" everywhere until the opening
 * balances are posted. A reversal takes its original's flag.
 */
export function backfilledFlags(
  entries: readonly WorkbookEntry[],
  goLiveOn: string | null
): Map<string, boolean> {
  const own = new Map(
    entries.map((e) => [e.id, goLiveOn !== null && e.economicOn < goLiveOn])
  );
  const flags = new Map<string, boolean>();
  for (const e of entries) {
    const original = e.reversesEntryId ? own.get(e.reversesEntryId) : undefined;
    flags.set(e.id, original ?? own.get(e.id) ?? false);
  }
  return flags;
}

// ── Receipts and payments ───────────────────────────────────────────────────

export const RECEIPTS_PAYMENTS_COLUMNS: WorkbookColumn[] = [
  day("Date"),
  text("Account", 24),
  text("Direction", 10),
  text("Kind", 16),
  amount("Amount (INR)"),
  text("Party name", 24),
  text("Payment reference or UTR", 24),
  text("Programme"),
  text("Project"),
  text("Account head", 20),
  text("Document type and reference", 48),
  text("Linked transfer reference", 38),
  text("Bank statement matched", 12),
  text("Movement ID", 38),
];

/** The one value a set of candidates agree on, else blank. */
function only(values: Iterable<string | null>): string {
  const distinct = new Set<string>();
  for (const value of values) {
    if (value) {
      distinct.add(value);
    }
  }
  return distinct.size === 1 ? ([...distinct][0] ?? "") : "";
}

/**
 * The recognition standing for each source (not a reversal, not reversed),
 * which names a cash movement's party, programme, project and head. A
 * source whose entries were all reversed falls back to its originals.
 */
function standingEntriesBySource(entries: readonly WorkbookEntry[]) {
  const reversed = new Set(
    entries.flatMap((e) => (e.reversesEntryId ? [e.reversesEntryId] : []))
  );
  const all = new Map<string, WorkbookEntry[]>();
  for (const e of entries) {
    if (e.reversesEntryId) {
      continue;
    }
    const key = `${e.sourceType}:${e.sourceId}`;
    const list = all.get(key) ?? [];
    list.push(e);
    all.set(key, list);
  }
  const standing = new Map<string, WorkbookEntry[]>();
  for (const [key, list] of all) {
    const live = list.filter((e) => !reversed.has(e.id));
    standing.set(key, live.length > 0 ? live : list);
  }
  return standing;
}

/**
 * Which recognition a movement belongs with: a fee is an expense, an
 * expense paid out is its expense (a reimbursement) or the supplier advance
 * it makes (a vendor payment's payment, layer 3-3a), and a gift's money in
 * or back out is income, or for a corpus gift a capital receipt credited to
 * the Corpus Fund (a fund head).
 */
function headTypesForMovement(
  kind: WorkbookMovement["kind"]
): readonly WorkbookEntry["headType"][] {
  if (kind === "fee" || kind === "tax_remittance") {
    return ["expense"];
  }
  if (kind === "payout") {
    return ["expense", "asset"];
  }
  if (kind === "receipt" || kind === "refund") {
    return ["income", "fund"];
  }
  return [];
}

interface AccountTotals {
  closingPaise: number;
  /** Money in during the year, opening movements excluded. */
  inPaise: number;
  openingPaise: number;
  outPaise: number;
}

/**
 * An account over the year: the balance brought forward (everything before
 * the year plus the year's opening movements, as the cash book counts them),
 * money in and out, and the closing balance.
 */
export function accountTotals(
  movements: readonly WorkbookMovement[],
  accountId: string,
  facts: Pick<WorkbookFacts, "year">
): AccountTotals {
  const totals = { closingPaise: 0, inPaise: 0, openingPaise: 0, outPaise: 0 };
  for (const m of movements) {
    if (m.orgAccountId !== accountId || m.occurredOn > facts.year.endsOn) {
      continue;
    }
    const signed = movementSignedPaise(m.direction, m.amountPaise);
    totals.closingPaise += signed;
    if (m.occurredOn < facts.year.startsOn || m.kind === "opening") {
      totals.openingPaise += signed;
    } else if (m.direction === "in") {
      totals.inPaise += m.amountPaise;
    } else {
      totals.outPaise += m.amountPaise;
    }
  }
  return totals;
}

function statementMatched(
  m: WorkbookMovement,
  account: WorkbookAccount,
  facts: WorkbookFacts
): string {
  if (account.kind !== "bank" || m.kind === "opening") {
    return "n/a";
  }
  // A movement reconciled to a bank line itself (layer 3-3b), or a source
  // a matched line backs.
  return facts.statementBacked.has(`movement:${m.id}`) ||
    facts.statementBacked.has(`${m.orgAccountId}:${m.sourceId}`)
    ? "Yes"
    : "No";
}

function balanceRow(
  on: string,
  account: WorkbookAccount,
  label: string,
  paise: number
): CellValue[] {
  return [
    on,
    account.name,
    "",
    label,
    rupees(paise),
    "",
    "",
    "",
    "",
    "",
    `${ACCOUNT_KIND_LABELS[account.kind]} account`,
    "",
    "",
    "",
  ];
}

/**
 * One row per cash book movement in the year, account by account, each
 * account opening with its balance brought forward (everything before the
 * year) and closing with its balance carried forward. The year's opening
 * movements (the cutover's opening balances) are listed as rows.
 */
export function receiptsAndPaymentsSheet(facts: WorkbookFacts): WorkbookSheet {
  const standing = standingEntriesBySource(facts.entries);
  const rows: WorkbookRow[] = [];
  for (const account of facts.accounts) {
    const movements = facts.movements.filter(
      (m) => m.orgAccountId === account.id
    );
    const totals = accountTotals(movements, account.id, facts);
    const inYearMovements = movements
      .filter((m) => inYear(m.occurredOn, facts))
      .sort(
        (a, b) =>
          a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id)
      );
    if (inYearMovements.length === 0 && totals.closingPaise === 0) {
      continue;
    }
    const broughtForward = movements
      .filter((m) => m.occurredOn < facts.year.startsOn)
      .reduce(
        (sum, m) => sum + movementSignedPaise(m.direction, m.amountPaise),
        0
      );
    rows.push({
      bold: true,
      cells: balanceRow(
        facts.year.startsOn,
        account,
        "Balance brought forward",
        broughtForward
      ),
    });
    for (const m of inYearMovements) {
      const headTypes = headTypesForMovement(m.kind);
      const matching = (
        standing.get(`${m.sourceType}:${m.sourceId}`) ?? []
      ).filter((e) => headTypes.includes(e.headType));
      const kind = MOVEMENT_KIND_LABELS[m.kind];
      rows.push({
        cells: [
          m.occurredOn,
          account.name,
          m.direction === "in" ? "In" : "Out",
          m.reversesMovementId ? `${kind} (reversal)` : kind,
          rupees(movementSignedPaise(m.direction, m.amountPaise)),
          only(matching.map((e) => e.partyName)),
          m.paymentReference ?? "",
          only(matching.map((e) => e.programmeName)),
          only(matching.map((e) => e.projectName)),
          only(matching.map((e) => e.headName)),
          documentReference(m.sourceType, m.sourceId),
          m.transferId ?? "",
          statementMatched(m, account, facts),
          m.id,
        ],
      });
    }
    rows.push({
      bold: true,
      cells: balanceRow(
        facts.year.endsOn,
        account,
        "Balance carried forward",
        totals.closingPaise
      ),
    });
  }
  return {
    columns: RECEIPTS_PAYMENTS_COLUMNS,
    name: SHEET_NAMES.receiptsPayments,
    rows,
  };
}

// ── Income and expenditure ──────────────────────────────────────────────────

export const INCOME_EXPENDITURE_COLUMNS: WorkbookColumn[] = [
  day("Economic date"),
  day("Posted date"),
  text("Account head", 22),
  text("Income or expense", 12),
  amount("Amount (INR)"),
  text("Programme"),
  text("Project"),
  text("Event", 22),
  text("Cost centre"),
  text("Fund", 22),
  text("Party name", 24),
  text("Medium", 10),
  text("Document type and reference", 48),
  text("Reversal of", 38),
  text("Backfilled", 10),
  text("Entry ID", 38),
  text("Memo", 28),
];

/**
 * One row per recognition entry in the year: income and expenditure, and
 * the asset, liability and fund lines (the opening balances), so every
 * entry the balance sheet items add up is traceable. Decreases are negative.
 */
export function incomeExpenditureSheet(facts: WorkbookFacts): WorkbookSheet {
  const backfilled = backfilledFlags(facts.entries, facts.goLiveOn);
  const rows = facts.entries
    .filter((e) => inYear(e.economicOn, facts))
    .map((e): WorkbookRow => ({
      cells: [
        e.economicOn,
        e.postedOn,
        e.headName,
        HEAD_TYPE_LABELS[e.headType],
        rupees(signedPaise(e.effect, e.amountPaise)),
        e.programmeName ?? "",
        e.projectName ?? "",
        e.eventName ?? "",
        e.costCentreName ?? "",
        e.fundName,
        e.partyName ?? "",
        e.medium === "in_kind" ? "In kind" : "Monetary",
        entryReference(e, facts),
        e.reversesEntryId ?? "",
        backfilled.get(e.id) ? "Yes" : "No",
        e.id,
        e.memo ?? "",
      ],
    }));
  return {
    columns: INCOME_EXPENDITURE_COLUMNS,
    name: SHEET_NAMES.incomeExpenditure,
    rows,
  };
}

// ── Income and expenditure summary ──────────────────────────────────────────

export const SUMMARY_COLUMNS: WorkbookColumn[] = [
  text("Account head", 28),
  text("Programme", 28),
  amount("Total for the year (INR)"),
];

const NO_PROGRAMME = "No programme";

export interface IncomeExpenditureTotals {
  expensePaise: number;
  incomePaise: number;
  surplusPaise: number;
}

/** Income and expenditure of the year, signed by effect. */
export function incomeExpenditureTotals(
  facts: WorkbookFacts
): IncomeExpenditureTotals {
  let incomePaise = 0;
  let expensePaise = 0;
  for (const e of facts.entries) {
    if (!inYear(e.economicOn, facts)) {
      continue;
    }
    if (e.headType === "income") {
      incomePaise += signedPaise(e.effect, e.amountPaise);
    } else if (e.headType === "expense") {
      expensePaise += signedPaise(e.effect, e.amountPaise);
    }
  }
  return {
    expensePaise,
    incomePaise,
    surplusPaise: incomePaise - expensePaise,
  };
}

interface Group {
  label: string;
  paise: number;
}

function addTo(
  groups: Map<string, Group>,
  key: string,
  label: string,
  paise: number
) {
  const group = groups.get(key) ?? { label, paise: 0 };
  group.paise += paise;
  groups.set(key, group);
}

function groupSection(
  entries: readonly WorkbookEntry[],
  label: "income" | "expenditure"
): { rows: WorkbookRow[]; totalPaise: number } {
  const heads = new Map<
    string,
    { label: string; programmes: Map<string, Group> }
  >();
  for (const e of entries) {
    const head = heads.get(e.accountHeadId) ?? {
      label: e.headName,
      programmes: new Map<string, Group>(),
    };
    addTo(
      head.programmes,
      e.programmeId ?? "",
      e.programmeName ?? NO_PROGRAMME,
      signedPaise(e.effect, e.amountPaise)
    );
    heads.set(e.accountHeadId, head);
  }
  const rows: WorkbookRow[] = [];
  let totalPaise = 0;
  for (const head of [...heads.values()].sort(byLabel)) {
    let headPaise = 0;
    for (const programme of [...head.programmes.values()].sort(byLabel)) {
      headPaise += programme.paise;
      rows.push({
        cells: [head.label, programme.label, rupees(programme.paise)],
      });
    }
    rows.push({
      bold: true,
      cells: [`${head.label} total`, "All programmes", rupees(headPaise)],
    });
    totalPaise += headPaise;
  }
  rows.push({
    bold: true,
    cells: [
      label === "income" ? "Total income" : "Total expenditure",
      "All programmes",
      rupees(totalPaise),
    ],
  });
  return { rows, totalPaise };
}

/**
 * The year's capital receipts, apart from income: corpus gifts less their
 * refunds, by head and fund, credited to the fund directly (the balance
 * sheet items show them as the fund's additions). None, no rows.
 */
function capitalReceiptRows(entries: readonly WorkbookEntry[]): WorkbookRow[] {
  const groups = new Map<string, Group>();
  for (const e of entries) {
    if (
      e.headType === "fund" &&
      CAPITAL_RECEIPT_HEAD_IDS.includes(e.accountHeadId)
    ) {
      addTo(
        groups,
        `${e.accountHeadId}:${e.fundId}`,
        `${e.headName} (${e.fundName})`,
        signedPaise(e.effect, e.amountPaise)
      );
    }
  }
  if (groups.size === 0) {
    return [];
  }
  return [
    { cells: [null, null, null] },
    {
      bold: true,
      cells: [
        "Capital receipts (credited to the fund, not income)",
        null,
        null,
      ],
    },
    ...[...groups.values()].sort(byLabel).map((group): WorkbookRow => ({
      cells: [group.label, "All programmes", rupees(group.paise)],
    })),
  ];
}

/**
 * The audited figures' year-end adjustments of the year (already in the
 * totals above), by document and head, so the CA sees their own
 * corrections apart: one block per document, its reversal included, with
 * what it added to the surplus. None, no rows.
 */
function auditedAdjustmentRows(
  entries: readonly WorkbookEntry[],
  facts: Pick<WorkbookFacts, "auditedFigures">
): WorkbookRow[] {
  const documents = new Map<string, Map<string, Group>>();
  for (const e of entries) {
    if (
      e.sourceType !== LEDGER_SOURCE_TYPES.auditedFigures ||
      !(e.headType === "income" || e.headType === "expense")
    ) {
      continue;
    }
    const heads = documents.get(e.sourceId) ?? new Map<string, Group>();
    addTo(
      heads,
      `${e.headType}:${e.accountHeadId}`,
      `${e.headName} (${e.headType === "income" ? "income" : "expenditure"})`,
      signedPaise(e.effect, e.amountPaise)
    );
    documents.set(e.sourceId, heads);
  }
  const rows: WorkbookRow[] = [];
  for (const [id, heads] of documents) {
    const document = facts.auditedFigures.get(id);
    let surplus = 0;
    for (const e of entries) {
      if (
        e.sourceId === id &&
        e.sourceType === LEDGER_SOURCE_TYPES.auditedFigures
      ) {
        surplus += surplusPaiseOf(e) ?? 0;
      }
    }
    rows.push(
      { cells: [null, null, null] },
      {
        bold: true,
        cells: [
          `${auditedAdjustmentsTitle(document)}${document?.reversed ? " (reversed)" : ""} (included above)`,
          null,
          null,
        ],
      },
      ...[...heads.values()].sort(byLabel).map((group): WorkbookRow => ({
        cells: [group.label, "All programmes", rupees(group.paise)],
      })),
      {
        bold: true,
        cells: ["Effect on the surplus", "All programmes", rupees(surplus)],
      }
    );
  }
  return rows;
}

/**
 * The year's income and expenditure by account head and programme, with a
 * total per head, per section and per programme, and the surplus (income
 * less expenditure). The totals tie to the income and expenditure sheet.
 * Corpus gifts are no income: they follow as capital receipts.
 */
export function summarySheet(facts: WorkbookFacts): WorkbookSheet {
  const entries = facts.entries.filter((e) => inYear(e.economicOn, facts));
  const income = groupSection(
    entries.filter((e) => e.headType === "income"),
    "income"
  );
  const expenditure = groupSection(
    entries.filter((e) => e.headType === "expense"),
    "expenditure"
  );
  const byProgramme = new Map<
    string,
    { expense: number; income: number; label: string }
  >();
  for (const e of entries) {
    if (!(e.headType === "income" || e.headType === "expense")) {
      continue;
    }
    const key = e.programmeId ?? "";
    const line = byProgramme.get(key) ?? {
      expense: 0,
      income: 0,
      label: e.programmeName ?? NO_PROGRAMME,
    };
    const paise = signedPaise(e.effect, e.amountPaise);
    if (e.headType === "income") {
      line.income += paise;
    } else {
      line.expense += paise;
    }
    byProgramme.set(key, line);
  }
  const programmeRows: WorkbookRow[] = [];
  for (const line of [...byProgramme.values()].sort(byLabel)) {
    programmeRows.push(
      { cells: ["Income", line.label, rupees(line.income)] },
      { cells: ["Expenditure", line.label, rupees(line.expense)] },
      {
        bold: true,
        cells: [
          "Income less expenditure",
          line.label,
          rupees(line.income - line.expense),
        ],
      }
    );
  }
  return {
    columns: SUMMARY_COLUMNS,
    name: SHEET_NAMES.summary,
    rows: [
      ...income.rows,
      ...expenditure.rows,
      {
        bold: true,
        cells: [
          "Income less expenditure (surplus)",
          "All programmes",
          rupees(income.totalPaise - expenditure.totalPaise),
        ],
      },
      ...capitalReceiptRows(entries),
      ...auditedAdjustmentRows(entries, facts),
      { cells: [null, null, null] },
      { bold: true, cells: ["By programme", null, null] },
      ...programmeRows,
    ],
  };
}

// ── Balance sheet items ─────────────────────────────────────────────────────

export const BALANCE_SHEET_COLUMNS: WorkbookColumn[] = [
  text("Item", 40),
  amount("Opening at 1 April (INR)"),
  amount("Increases (INR)"),
  amount("Decreases (INR)"),
  amount("Closing at 31 March (INR)"),
  amount("Last bank statement balance (INR)"),
  day("Statement date"),
];

interface ItemTotals {
  decreasesPaise: number;
  increasesPaise: number;
  openingPaise: number;
}

interface Item {
  label: string;
  totals: ItemTotals;
}

const emptyTotals = (): ItemTotals => ({
  decreasesPaise: 0,
  increasesPaise: 0,
  openingPaise: 0,
});

const closingOf = (t: ItemTotals) =>
  t.openingPaise + t.increasesPaise - t.decreasesPaise;

const itemRow = (
  label: string,
  totals: ItemTotals,
  statement?: { balancePaise: number; valueOn: string } | null
): WorkbookRow => ({
  cells: [
    label,
    rupees(totals.openingPaise),
    rupees(totals.increasesPaise),
    rupees(totals.decreasesPaise),
    rupees(closingOf(totals)),
    statement ? rupees(statement.balancePaise) : null,
    statement ? statement.valueOn : null,
  ],
});

const sumTotals = (list: readonly ItemTotals[]): ItemTotals =>
  list.reduce(
    (sum, t) => ({
      decreasesPaise: sum.decreasesPaise + t.decreasesPaise,
      increasesPaise: sum.increasesPaise + t.increasesPaise,
      openingPaise: sum.openingPaise + t.openingPaise,
    }),
    emptyTotals()
  );

const totalRow = (label: string, totals: ItemTotals): WorkbookRow => ({
  ...itemRow(label, totals),
  bold: true,
});

/** An entry that is part of the year's opening position. */
const isOpeningEntry = (e: WorkbookEntry, facts: WorkbookFacts) =>
  e.economicOn < facts.year.startsOn ||
  e.sourceType === LEDGER_SOURCE_TYPES.openingBalance;

/** Adds an entry to its item: the opening, or the year's increases or decreases. */
function addEntry(totals: ItemTotals, e: WorkbookEntry, facts: WorkbookFacts) {
  if (isOpeningEntry(e, facts)) {
    totals.openingPaise += signedPaise(e.effect, e.amountPaise);
  } else if (e.effect === "increase") {
    totals.increasesPaise += e.amountPaise;
  } else {
    totals.decreasesPaise += e.amountPaise;
  }
}

/**
 * Asset and liability items, by account head. Fixed assets (an asset head)
 * keep one item per opening line, named by its memo (the asset), and
 * collect everything else under that head in "<head> — other".
 */
function headItems(facts: WorkbookFacts, headType: "asset" | "liability") {
  const items = new Map<string, Item>();
  for (const e of facts.entries) {
    if (e.headType !== headType || e.economicOn > facts.year.endsOn) {
      continue;
    }
    let key = e.accountHeadId;
    let label = e.headName;
    if (headType === "asset") {
      // The same lines as the Audited figures page: an opening line's
      // asset, with the audited figures' depreciation against its name.
      const lineMemo = assetLineMemo(e);
      key = lineMemo
        ? `${e.accountHeadId}:line:${lineMemo}`
        : `${e.accountHeadId}:other`;
      label = lineMemo ? `${e.headName}: ${lineMemo}` : `${e.headName} — other`;
    }
    const item = items.get(key) ?? { label, totals: emptyTotals() };
    addEntry(item.totals, e, facts);
    items.set(key, item);
  }
  return [...items.values()].sort(byLabel);
}

interface FundItem extends Item {
  /** The General Fund's year is a surplus or deficit; another fund's, additions or deductions. */
  general: boolean;
  /**
   * For a fund with income or expenditure or a capital receipt posted to
   * it, its parts as the statements' fund note shows them: the opening
   * balance (fund balance entries, earlier years' capital receipts and
   * every earlier year's surplus), the year's capital receipts (corpus
   * gifts credited straight to the Corpus Fund, less their refunds, by
   * effect) and the year's surplus or deficit.
   */
  parts: {
    additions: ItemTotals | null;
    opening: ItemTotals;
    surplus: ItemTotals | null;
  } | null;
}

/** A net figure as an increase, or a decrease when negative. */
const netTotals = (paise: number): ItemTotals => ({
  decreasesPaise: Math.max(-paise, 0),
  increasesPaise: Math.max(paise, 0),
  openingPaise: 0,
});

/**
 * Fund items, by fund. Income and expenditure roll into the fund each
 * entry is posted to (the General Fund for unrestricted income): earlier
 * years' surplus is part of the fund's opening and the year's surplus is
 * its increase (a deficit its decrease). A corpus gift is no income: it is
 * credited to the Corpus Fund directly, so it is that fund's addition of
 * the year (a refund its deduction) and part of its opening after. No
 * year-close entry is posted; the roll-forward is how the books are read,
 * so the next year needs no new opening balance.
 */
function fundItems(facts: WorkbookFacts): FundItem[] {
  const funds = new Map<
    string,
    {
      additions: ItemTotals;
      hasAdditions: boolean;
      hasCapital: boolean;
      hasSurplus: boolean;
      label: string;
      opening: ItemTotals;
      surplusPaise: number;
    }
  >();
  for (const e of facts.entries) {
    if (e.economicOn > facts.year.endsOn) {
      continue;
    }
    const surplus = surplusPaiseOf(e);
    if (e.headType !== "fund" && surplus === null) {
      continue;
    }
    const fund = funds.get(e.fundId) ?? {
      additions: emptyTotals(),
      hasAdditions: false,
      hasCapital: false,
      hasSurplus: false,
      label: e.fundName,
      opening: emptyTotals(),
      surplusPaise: 0,
    };
    if (surplus === null) {
      // A fund that takes capital receipts shows its parts every year.
      fund.hasCapital ||= CAPITAL_RECEIPT_HEAD_IDS.includes(e.accountHeadId);
      if (isOpeningEntry(e, facts)) {
        addEntry(fund.opening, e, facts);
      } else {
        fund.hasAdditions = true;
        addEntry(fund.additions, e, facts);
      }
    } else {
      fund.hasSurplus = true;
      if (e.economicOn < facts.year.startsOn) {
        fund.opening.openingPaise += surplus;
      } else {
        fund.surplusPaise += surplus;
      }
    }
    funds.set(e.fundId, fund);
  }
  return [...funds]
    .map(([fundId, fund]): FundItem => {
      const surplus = netTotals(fund.surplusPaise);
      const additions = fund.hasAdditions ? fund.additions : null;
      return {
        general: fundId === GENERAL_FUND_ID,
        label: fund.label,
        parts:
          fund.hasSurplus || fund.hasAdditions || fund.hasCapital
            ? {
                additions,
                opening: fund.opening,
                surplus: fund.hasSurplus ? surplus : null,
              }
            : null,
        totals: sumTotals([fund.opening, fund.additions, surplus]),
      };
    })
    .filter(({ totals }) => !isZero(totals))
    .sort(byLabel);
}

/** Nothing at the start, nothing in the year: a fund not worth a row. */
const isZero = (t: ItemTotals) =>
  t.openingPaise === 0 && t.increasesPaise === 0 && t.decreasesPaise === 0;

/**
 * A fund's rows: one item, or for a fund carrying income less expenditure
 * or capital receipts its opening balance, the year's figure and the
 * fund's total in bold. The General Fund's year is its current year
 * surplus/(deficit), a net figure (the gross income and expenditure are in
 * the I&E sheets). Another fund's is its additions/(deductions) during the
 * year: its capital receipts (for the Corpus Fund, the corpus gifts less
 * their refunds, gross) plus any surplus posted to it, net. A fund that is
 * zero throughout has no row.
 */
function fundRows({ general, label, parts, totals }: FundItem): WorkbookRow[] {
  if (!parts) {
    return [itemRow(label, totals)];
  }
  const additionsLabel = `${label}: additions/(deductions) during the year`;
  const year: WorkbookRow[] = general
    ? [
        itemRow(
          `${label}: current year surplus/(deficit)`,
          parts.surplus ?? emptyTotals()
        ),
        ...(parts.additions ? [itemRow(additionsLabel, parts.additions)] : []),
      ]
    : [
        itemRow(
          additionsLabel,
          sumTotals([
            parts.additions ?? emptyTotals(),
            parts.surplus ?? emptyTotals(),
          ])
        ),
      ];
  return [
    itemRow(`${label}: opening balance`, parts.opening),
    ...year,
    totalRow(`${label} total`, totals),
  ];
}

export interface BalanceCheck {
  assets: ItemTotals;
  closingDifferencePaise: number;
  fundsAndLiabilities: ItemTotals;
  openingDifferencePaise: number;
}

/**
 * Each account, fixed asset, liability and fund from its opening at 1 April
 * through the year's increases and decreases to its closing at 31 March (a
 * fund carrying income less expenditure as its opening balance plus the
 * current year surplus/(deficit), which ties to the summary's surplus; the
 * Corpus Fund's corpus gifts as its additions during the year);
 * bank and fixed deposit closings beside their last bank statement balance;
 * and the check row: assets less funds and liabilities, zero when the books
 * balance.
 */
export function balanceSheet(facts: WorkbookFacts): {
  check: BalanceCheck;
  sheet: WorkbookSheet;
} {
  const accountItems = facts.accounts.map((account) => {
    const t = accountTotals(facts.movements, account.id, facts);
    return {
      account,
      totals: {
        decreasesPaise: t.outPaise,
        increasesPaise: t.inPaise,
        openingPaise: t.openingPaise,
      },
    };
  });
  const assetItems = headItems(facts, "asset");
  const liabilityItems = headItems(facts, "liability");
  const funds = fundItems(facts);

  const assets = sumTotals([
    ...accountItems.map((a) => a.totals),
    ...assetItems.map((a) => a.totals),
  ]);
  const fundsTotal = sumTotals(funds.map((f) => f.totals));
  const liabilitiesTotal = sumTotals(liabilityItems.map((l) => l.totals));
  const fundsAndLiabilities = sumTotals([fundsTotal, liabilitiesTotal]);
  const openingDifferencePaise =
    assets.openingPaise - fundsAndLiabilities.openingPaise;
  const closingDifferencePaise =
    closingOf(assets) - closingOf(fundsAndLiabilities);

  const heading = (label: string): WorkbookRow => ({
    bold: true,
    cells: [label, null, null, null, null, null, null],
  });
  const rows: WorkbookRow[] = [
    heading("Assets"),
    ...accountItems.map(({ account, totals }) =>
      itemRow(
        `${account.name} (${ACCOUNT_KIND_LABELS[account.kind]})`,
        totals,
        account.kind === "bank" || account.kind === "deposit"
          ? (facts.lastStatementBalances.get(account.id) ?? null)
          : null
      )
    ),
    ...assetItems.map(({ label, totals }) => itemRow(label, totals)),
    totalRow("Total assets", assets),
    heading("Funds"),
    ...funds.flatMap(fundRows),
    totalRow("Total funds", fundsTotal),
    heading("Liabilities"),
    ...liabilityItems.map(({ label, totals }) => itemRow(label, totals)),
    totalRow("Total liabilities", liabilitiesTotal),
    totalRow("Total funds and liabilities", fundsAndLiabilities),
    {
      bold: true,
      cells: [
        closingDifferencePaise === 0 && openingDifferencePaise === 0
          ? "Check: assets less funds and liabilities (balances)"
          : "Check: assets less funds and liabilities (does not balance)",
        rupees(openingDifferencePaise),
        null,
        null,
        rupees(closingDifferencePaise),
        null,
        null,
      ],
    },
  ];
  return {
    check: {
      assets,
      closingDifferencePaise,
      fundsAndLiabilities,
      openingDifferencePaise,
    },
    sheet: {
      columns: BALANCE_SHEET_COLUMNS,
      name: SHEET_NAMES.balanceSheet,
      rows,
    },
  };
}

// ── Donor list (Form 113) ───────────────────────────────────────────────────

/** The donations return's all-gifts columns, in its order. */
export const DONOR_COLUMNS: WorkbookColumn[] = [
  day("Received on"),
  text("Donor", 28),
  text("ID (last 4)", 20),
  amount("Amount (INR)"),
  amount("Refunded (INR)"),
  amount("Net (INR)"),
  text("Channel", 12),
  text("Mode of receipt", 16),
  text("Donation type", 16),
  text("Tax certificate", 16),
  text("Status", 14),
  text("Reason", 40),
  text("Receipt issued by", 16),
  text("Receipt number", 18),
  text("Contribution ID", 38),
];

/**
 * The donations return's "all gifts" rows (the CA's file on the Donations
 * return page): every gift of the year with its status, reason and
 * receipt, ID numbers masked to their last four characters (the return's
 * upload file carries them in full).
 */
export function donorSheet(gifts: readonly AllGiftsRow[]): WorkbookSheet {
  const rows = gifts.map((gift): WorkbookRow => ({
    cells: [
      gift.receivedOn,
      gift.donor,
      gift.id,
      rupees(gift.amountPaise),
      rupees(gift.refundedPaise),
      rupees(gift.netPaise),
      gift.channel,
      gift.reportingMode,
      gift.donationType,
      gift.deductionEligible,
      gift.status,
      gift.reason,
      gift.receiptIssuer,
      gift.receiptNumber,
      gift.contributionId,
    ],
  }));
  return { columns: DONOR_COLUMNS, name: SHEET_NAMES.donors, rows };
}

export const DONOR_SHEET_WITHHELD =
  "Left out: the donor list needs a donor permission (donors.view or donors.manage) or finance.view_sensitive.";

/** The donor list's place in a workbook for someone who may not see donors. */
export function withheldDonorSheet(): WorkbookSheet {
  return {
    columns: [text("Note", 80)],
    name: SHEET_NAMES.donors,
    rows: [{ cells: [DONOR_SHEET_WITHHELD] }],
  };
}
