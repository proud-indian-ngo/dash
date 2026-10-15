/**
 * The books (finance Phase 3): shared values and the pure arithmetic behind
 * the books views and the opening-balance check. Two single-entry books are
 * kept and never added together: recognition (`ledger_entry`: income,
 * expense, asset, liability and fund effects) and the cash book
 * (`account_movement`: money in and out of the trust's own accounts).
 * Amounts are integer paise and always positive; the sign comes from the
 * entry's effect or the movement's direction.
 */

/** The first day the pi-dash ledger keeps the books (FY 2026-27). Nothing earlier is posted. */
export const LEDGER_CUTOVER_ON = "2026-04-01";

export const ledgerEffectValues = ["increase", "decrease"] as const;
export type LedgerEffect = (typeof ledgerEffectValues)[number];

export const ledgerMediumValues = ["monetary", "in_kind"] as const;
export type LedgerMedium = (typeof ledgerMediumValues)[number];

export const movementDirectionValues = ["in", "out"] as const;
export type MovementDirection = (typeof movementDirectionValues)[number];

export const movementKindValues = [
  "receipt",
  "payout",
  "transfer",
  "refund",
  "fee",
  "tax_remittance",
  "opening",
] as const;
export type MovementKind = (typeof movementKindValues)[number];

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  fee: "Fee",
  opening: "Opening",
  payout: "Payout",
  receipt: "Receipt",
  refund: "Refund",
  tax_remittance: "Tax payment",
  transfer: "Transfer",
};

export const fiscalYearEventActionValues = ["close", "reopen"] as const;
export type FiscalYearEventAction =
  (typeof fiscalYearEventActionValues)[number];

/**
 * Source documents that post. Later layers add their own (contribution,
 * settlement, reimbursement, vendor payment, adjustment).
 */
export const LEDGER_SOURCE_TYPES = {
  openingBalance: "opening_balance",
} as const;
export type LedgerSourceType =
  (typeof LEDGER_SOURCE_TYPES)[keyof typeof LEDGER_SOURCE_TYPES];

export const POSTING_ACTIONS = {
  post: "post",
  reverse: "reverse",
} as const;

/** Permissions of the treasurer's book-keeping actions. */
export const BOOKS_PERMISSIONS = {
  adjust: "finance.adjust",
  closeYear: "finance.close_year",
  postOpening: "finance.post_opening",
  reopenYear: "finance.reopen_year",
} as const;

/** Who may open the books pages. */
export const BOOKS_VIEW_PERMISSIONS = [
  "finance.view",
  "finance.manage",
] as const;

export const signedPaise = (effect: LedgerEffect, amountPaise: number) =>
  effect === "increase" ? amountPaise : -amountPaise;

export const movementSignedPaise = (
  direction: MovementDirection,
  amountPaise: number
) => (direction === "in" ? amountPaise : -amountPaise);

// ── Opening balances ────────────────────────────────────────────────────────

/**
 * One line of the opening-balance document: money in one of the trust's
 * accounts (a cash book opening movement), or a non-cash asset, a
 * liability or a fund balance (an opening recognition entry).
 */
export type OpeningLineKind = "account" | "asset" | "liability" | "fund";

export interface OpeningLineAmount {
  amountPaise: number;
  kind: OpeningLineKind;
}

export interface OpeningBalanceCheck {
  /** Account balances plus asset lines. */
  assetsPaise: number;
  /** Zero when the opening balances balance. */
  balanced: boolean;
  /** Assets less funds and liabilities. */
  differencePaise: number;
  fundsPaise: number;
  liabilitiesPaise: number;
}

/** Assets must equal funds plus liabilities, and something must be entered. */
export function openingBalanceCheck(
  lines: readonly OpeningLineAmount[]
): OpeningBalanceCheck {
  let assetsPaise = 0;
  let fundsPaise = 0;
  let liabilitiesPaise = 0;
  for (const line of lines) {
    if (line.kind === "account" || line.kind === "asset") {
      assetsPaise += line.amountPaise;
    } else if (line.kind === "fund") {
      fundsPaise += line.amountPaise;
    } else {
      liabilitiesPaise += line.amountPaise;
    }
  }
  const differencePaise = assetsPaise - fundsPaise - liabilitiesPaise;
  return {
    assetsPaise,
    balanced: differencePaise === 0 && assetsPaise > 0,
    differencePaise,
    fundsPaise,
    liabilitiesPaise,
  };
}

// ── Cash book ───────────────────────────────────────────────────────────────

export interface BookMovement {
  amountPaise: number;
  direction: MovementDirection;
  /** Time-ordered (uuidv7), so it orders same-day movements. */
  id: string;
  /** `opening` movements are the year's opening balance, not money in. */
  kind?: MovementKind;
  /** yyyy-MM-dd */
  occurredOn: string;
  orgAccountId: string;
}

export interface DateRange {
  /** Inclusive, yyyy-MM-dd. */
  endsOn: string;
  /** Inclusive, yyyy-MM-dd. */
  startsOn: string;
}

/** Each account's balance at the end of `asOf` (inclusive). */
export function accountBalances(
  movements: readonly BookMovement[],
  asOf: string
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const m of movements) {
    if (m.occurredOn <= asOf) {
      balances.set(
        m.orgAccountId,
        (balances.get(m.orgAccountId) ?? 0) +
          movementSignedPaise(m.direction, m.amountPaise)
      );
    }
  }
  return balances;
}

export type CashBookRow<T extends BookMovement> = T & {
  /** Balance after this movement. */
  balancePaise: number;
  /** yyyy-MM */
  month: string;
};

export interface CashBook<T extends BookMovement> {
  closingPaise: number;
  inPaise: number;
  netPaise: number;
  /** Balance before the range starts. */
  openingPaise: number;
  outPaise: number;
  /** Oldest first, with the running balance. */
  rows: CashBookRow<T>[];
}

/**
 * One account's movements in a range, oldest first (by date, then by the
 * time-ordered id, so a same-day reversal and repost keep their order),
 * with a running balance that starts from everything before the range.
 * Opening movements dated in the range (the cutover's opening balances and
 * their reversals) count towards the opening balance, not money in or out.
 */
export function cashBook<T extends BookMovement>(
  movements: readonly T[],
  orgAccountId: string,
  range: DateRange
): CashBook<T> {
  const mine = movements
    .filter((m) => m.orgAccountId === orgAccountId)
    .sort(
      (a, b) =>
        a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id)
    );
  let balance = 0;
  let openingPaise = 0;
  let inPaise = 0;
  let outPaise = 0;
  const rows: CashBookRow<T>[] = [];
  for (const m of mine) {
    if (m.occurredOn > range.endsOn) {
      break;
    }
    const signed = movementSignedPaise(m.direction, m.amountPaise);
    balance += signed;
    if (m.occurredOn < range.startsOn) {
      openingPaise += signed;
      continue;
    }
    if (m.kind === "opening") {
      openingPaise += signed;
    } else if (m.direction === "in") {
      inPaise += m.amountPaise;
    } else {
      outPaise += m.amountPaise;
    }
    rows.push({
      ...m,
      balancePaise: balance,
      month: m.occurredOn.slice(0, 7),
    });
  }
  return {
    closingPaise: balance,
    inPaise,
    netPaise: inPaise - outPaise,
    openingPaise,
    outPaise,
    rows,
  };
}

// ── Recognition ─────────────────────────────────────────────────────────────

export type BookHeadType =
  | "income"
  | "expense"
  | "asset"
  | "liability"
  | "fund";

export interface BookEntry {
  accountHeadId: string;
  amountPaise: number;
  /** yyyy-MM-dd */
  economicOn: string;
  effect: LedgerEffect;
  fundId: string;
  headType: BookHeadType;
  id: string;
  programmeId: string | null;
}

export interface IncomeExpenditureLine {
  count: number;
  /** Account head or programme id ("" for no programme). */
  key: string;
  paise: number;
}

export interface IncomeExpenditure {
  expense: IncomeExpenditureLine[];
  expenseTotalPaise: number;
  income: IncomeExpenditureLine[];
  incomeTotalPaise: number;
  surplusPaise: number;
}

function addLine(
  lines: Map<string, IncomeExpenditureLine>,
  key: string,
  paise: number
) {
  const line = lines.get(key) ?? { count: 0, key, paise: 0 };
  line.count += 1;
  line.paise += paise;
  lines.set(key, line);
}

/**
 * Income and expenditure for a range, by account head or by programme.
 * Income heads count increases as income; expense heads count increases as
 * spending; decreases (refunds, reversals) net against them.
 */
export function incomeExpenditure(
  entries: readonly BookEntry[],
  range: DateRange,
  by: "head" | "programme"
): IncomeExpenditure {
  const income = new Map<string, IncomeExpenditureLine>();
  const expense = new Map<string, IncomeExpenditureLine>();
  for (const e of entries) {
    if (
      e.economicOn < range.startsOn ||
      e.economicOn > range.endsOn ||
      !(e.headType === "income" || e.headType === "expense")
    ) {
      continue;
    }
    const key = by === "head" ? e.accountHeadId : (e.programmeId ?? "");
    addLine(
      e.headType === "income" ? income : expense,
      key,
      signedPaise(e.effect, e.amountPaise)
    );
  }
  const sorted = (lines: Map<string, IncomeExpenditureLine>) =>
    [...lines.values()].sort((a, b) => b.paise - a.paise);
  const total = (lines: Map<string, IncomeExpenditureLine>) =>
    [...lines.values()].reduce((sum, line) => sum + line.paise, 0);
  const incomeTotalPaise = total(income);
  const expenseTotalPaise = total(expense);
  return {
    expense: sorted(expense),
    expenseTotalPaise,
    income: sorted(income),
    incomeTotalPaise,
    surplusPaise: incomeTotalPaise - expenseTotalPaise,
  };
}

// ── Balance summary ─────────────────────────────────────────────────────────

export interface BalanceLine {
  /** Org account, account head or fund id; "surplus" for the running surplus. */
  key: string;
  kind: "account" | "head" | "fund" | "surplus";
  paise: number;
}

export interface BalanceSummary {
  assets: BalanceLine[];
  assetsPaise: number;
  balanced: boolean;
  /** Assets less funds and liabilities; zero when the books agree. */
  differencePaise: number;
  funds: BalanceLine[];
  fundsPaise: number;
  liabilities: BalanceLine[];
  liabilitiesPaise: number;
}

/**
 * The balance position at the end of `asOf`: account balances from the cash
 * book plus asset heads are the assets; liability heads the liabilities;
 * fund heads (per fund) plus income less expenditure since the cutover the
 * funds. Every account is listed, even at zero, so the rail and the summary
 * agree; heads and funds appear once they carry an entry.
 */
export function balanceSummary(input: {
  accountIds: readonly string[];
  asOf: string;
  entries: readonly BookEntry[];
  movements: readonly BookMovement[];
}): BalanceSummary {
  const balances = accountBalances(input.movements, input.asOf);
  const assets: BalanceLine[] = input.accountIds.map((id) => ({
    key: id,
    kind: "account",
    paise: balances.get(id) ?? 0,
  }));
  const assetHeads = new Map<string, number>();
  const liabilityHeads = new Map<string, number>();
  const funds = new Map<string, number>();
  let surplus = 0;
  let hasSurplus = false;
  for (const e of input.entries) {
    if (e.economicOn > input.asOf) {
      continue;
    }
    const paise = signedPaise(e.effect, e.amountPaise);
    if (e.headType === "asset") {
      assetHeads.set(
        e.accountHeadId,
        (assetHeads.get(e.accountHeadId) ?? 0) + paise
      );
    } else if (e.headType === "liability") {
      liabilityHeads.set(
        e.accountHeadId,
        (liabilityHeads.get(e.accountHeadId) ?? 0) + paise
      );
    } else if (e.headType === "fund") {
      funds.set(e.fundId, (funds.get(e.fundId) ?? 0) + paise);
    } else {
      hasSurplus = true;
      surplus += e.headType === "income" ? paise : -paise;
    }
  }
  for (const [key, paise] of assetHeads) {
    assets.push({ key, kind: "head", paise });
  }
  const liabilities: BalanceLine[] = [...liabilityHeads].map(
    ([key, paise]) => ({ key, kind: "head", paise })
  );
  const fundLines: BalanceLine[] = [...funds].map(([key, paise]) => ({
    key,
    kind: "fund",
    paise,
  }));
  if (hasSurplus) {
    fundLines.push({ key: "surplus", kind: "surplus", paise: surplus });
  }
  const sum = (lines: BalanceLine[]) =>
    lines.reduce((total, line) => total + line.paise, 0);
  const assetsPaise = sum(assets);
  const liabilitiesPaise = sum(liabilities);
  const fundsPaise = sum(fundLines);
  const differencePaise = assetsPaise - liabilitiesPaise - fundsPaise;
  return {
    assets,
    assetsPaise,
    balanced: differencePaise === 0,
    differencePaise,
    funds: fundLines,
    fundsPaise,
    liabilities,
    liabilitiesPaise,
  };
}

/** The date the books views read balances at: the year's end, or today while the year runs. */
export function booksAsOf(range: DateRange, today: string): string {
  if (today >= range.endsOn) {
    return range.endsOn;
  }
  return today < range.startsOn ? range.startsOn : today;
}
