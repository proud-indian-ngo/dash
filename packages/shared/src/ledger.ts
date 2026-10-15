/**
 * The books (finance Phase 3): shared values and the pure arithmetic behind
 * the books views and the opening-balance check. Two single-entry books are
 * kept and never added together: recognition (`ledger_entry`: income,
 * expense, asset, liability and fund effects) and the cash book
 * (`account_movement`: money in and out of the trust's own accounts).
 * Amounts are integer paise and always positive; the sign comes from the
 * entry's effect or the movement's direction.
 */

import { CAPITAL_RECEIPT_HEAD_IDS } from "./constants";

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
 * Source documents that post. Layer 3-3a adds the expense side
 * (reimbursements, vendor payments and their payments); the adjustment
 * document comes with layer 3-3c.
 */
export const LEDGER_SOURCE_TYPES = {
  contribution: "contribution",
  contributionRefund: "contribution_refund",
  gatewaySettlement: "gateway_settlement",
  openingBalance: "opening_balance",
  otherIncome: "other_income",
  /** An approved (already paid) reimbursement: expense per line and the payment. */
  reimbursement: "reimbursement",
  /** A bank statement line marked as a transfer between the trust's own accounts. */
  statementTransfer: "statement_transfer",
  /** A vendor payment request: expense per line once its invoice is accepted. */
  vendorPayment: "vendor_payment",
  /** One approved payment of a vendor payment request: money out of the bank. */
  vendorPaymentTransaction: "vendor_payment_transaction",
} as const;
export type LedgerSourceType =
  (typeof LEDGER_SOURCE_TYPES)[keyof typeof LEDGER_SOURCE_TYPES];

/** The sources income posting handles (layer 3-2), posted by the server only. */
export const INCOME_SOURCE_TYPES = [
  LEDGER_SOURCE_TYPES.contribution,
  LEDGER_SOURCE_TYPES.contributionRefund,
  LEDGER_SOURCE_TYPES.otherIncome,
  LEDGER_SOURCE_TYPES.gatewaySettlement,
  LEDGER_SOURCE_TYPES.statementTransfer,
] as const;
export type IncomeSourceType = (typeof INCOME_SOURCE_TYPES)[number];

export const isIncomeSourceType = (value: string): value is IncomeSourceType =>
  (INCOME_SOURCE_TYPES as readonly string[]).includes(value);

/** The sources expense posting handles (layer 3-3a), posted by the server only. */
export const EXPENSE_SOURCE_TYPES = [
  LEDGER_SOURCE_TYPES.reimbursement,
  LEDGER_SOURCE_TYPES.vendorPayment,
  LEDGER_SOURCE_TYPES.vendorPaymentTransaction,
] as const;
export type ExpenseSourceType = (typeof EXPENSE_SOURCE_TYPES)[number];

export const isExpenseSourceType = (
  value: string
): value is ExpenseSourceType =>
  (EXPENSE_SOURCE_TYPES as readonly string[]).includes(value);

/**
 * Every source the automatic posting runs look at (income and expenses);
 * opening balances are posted by hand and never swept.
 */
export const POSTED_SOURCE_TYPES = [
  ...INCOME_SOURCE_TYPES,
  ...EXPENSE_SOURCE_TYPES,
] as const;
export type PostedSourceType = (typeof POSTED_SOURCE_TYPES)[number];

export const LEDGER_SOURCE_LABELS: Record<LedgerSourceType, string> = {
  contribution: "Contribution",
  contribution_refund: "Refund",
  gateway_settlement: "Settlement",
  opening_balance: "Opening balances",
  other_income: "Other income",
  reimbursement: "Reimbursement",
  statement_transfer: "Transfer",
  vendor_payment: "Vendor payment",
  vendor_payment_transaction: "Vendor payment made",
};

export const POSTING_ACTIONS = {
  /** Cash-book part of an income source: money in, out or across accounts. */
  cash: "cash",
  post: "post",
  /** Recognition part of an income source: income and expense entries. */
  recognise: "recognise",
  reverse: "reverse",
} as const;

/**
 * Where an income source stands in the books (`ledger_source_state`):
 * `posted` (its postings stand and match the record), `waiting` (it should
 * post but can't yet; the reason says why) or `none` (nothing posts for it,
 * such as a pending gift or one dated before the cutover).
 */
export const ledgerSourceStatusValues = ["posted", "waiting", "none"] as const;
export type LedgerSourceStatus = (typeof ledgerSourceStatusValues)[number];

/** Why a source waits to post. */
export const LEDGER_WAIT_REASONS = {
  closedYear: "year_closed",
  error: "error",
  /**
   * An accepted vendor invoice larger than the request's approved payments
   * (lines raised, or a payment rejected or deleted, after the invoice):
   * posting it would leave the books unbalanced, so it waits until the
   * payments and the lines agree.
   */
  invoiceExceedsPayments: "invoice_exceeds_payments",
  noBankAccount: "pick_bank_account",
  noClearingAccount: "no_clearing_account",
  noOtherAccount: "pick_other_account",
  /**
   * An expense paid from "the main bank account" (cutover doc section 3)
   * when the trust has no active bank account, or several and none marked
   * as the main one.
   */
  noPayingAccount: "pick_paying_account",
  /**
   * An approved reimbursement with no payment screenshot (older records):
   * the founder supplies the payment (cutover doc section 6).
   */
  noPaymentProof: "no_payment_proof",
  /**
   * A vendor payment request paid partly before 1 April 2026 and partly
   * after: the audited opening balances hold the earlier part, so how its
   * invoice posts is the CA's call.
   */
  paidAcrossCutover: "paid_across_cutover",
  referenceDataMissing: "reference_data_missing",
  /** Only in the year-close checklist: a record no posting run has seen. */
  unchecked: "unchecked",
} as const;
export type LedgerWaitReason =
  (typeof LEDGER_WAIT_REASONS)[keyof typeof LEDGER_WAIT_REASONS];

export const LEDGER_WAIT_REASON_LABELS: Record<LedgerWaitReason, string> = {
  error: "Couldn't post",
  invoice_exceeds_payments:
    "The invoice is more than the approved payments: record the missing payment or correct the lines",
  unchecked: "Not looked at yet: post pending",
  no_clearing_account: "The settlement has no clearing account",
  pick_bank_account:
    "Pick the bank account: match the payout's bank statement line",
  no_payment_proof:
    "No payment screenshot: the founder gives the payment date, account and bank reference",
  paid_across_cutover:
    "Paid partly before 1 Apr 2026: ask the CA how its invoice posts",
  pick_other_account: "Pick the other account of the transfer",
  pick_paying_account:
    "The bank account it was paid from isn't known: mark the main bank account in Settings → Organisation accounts",
  reference_data_missing: "Books reference data missing",
  year_closed: "Year closed",
};

/** Why nothing posts for a source; shown on its sheet. */
export const LEDGER_SKIP_REASONS = {
  beforeCutover: "before_cutover",
  deleted: "deleted",
  /** A vendor payment whose invoice (or no-invoice reason) isn't accepted yet. */
  invoiceNotAccepted: "invoice_not_accepted",
  /** A reimbursement, vendor payment or payment that isn't approved. */
  notApproved: "not_approved",
  notProcessed: "not_processed",
  notReceived: "not_received",
  otherSidePosts: "other_side_posts",
  unmatched: "unmatched",
} as const;
export type LedgerSkipReason =
  (typeof LEDGER_SKIP_REASONS)[keyof typeof LEDGER_SKIP_REASONS];

export const LEDGER_SKIP_REASON_LABELS: Record<LedgerSkipReason, string> = {
  before_cutover:
    "Dated before 1 Apr 2026: the audited opening balances already contain it",
  deleted: "Deleted",
  invoice_not_accepted: "The invoice isn't approved yet",
  not_approved: "Not approved",
  not_processed: "Not processed yet",
  not_received: "Not received, or reversed",
  other_side_posts: "Posted from the other account's statement line",
  unmatched: "No longer marked as a transfer",
};

/** The words for a source's state: its wait or skip reason. */
export function ledgerReasonLabel(reason: string | null | undefined): string {
  if (!reason) {
    return "";
  }
  return (
    (LEDGER_WAIT_REASON_LABELS as Record<string, string>)[reason] ??
    (LEDGER_SKIP_REASON_LABELS as Record<string, string>)[reason] ??
    reason.replaceAll("_", " ")
  );
}

/** Permissions of the treasurer's book-keeping actions. */
export const BOOKS_PERMISSIONS = {
  adjust: "finance.adjust",
  closeYear: "finance.close_year",
  postOpening: "finance.post_opening",
  postPending: "finance.post_pending",
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

/**
 * What an entry adds to income less expenditure: income increases and
 * expense decreases (refunds of spending) raise it; expense increases and
 * income decreases (refunds to donors) lower it. Null for balance heads.
 */
export function surplusPaiseOf(
  e: Pick<BookEntry, "amountPaise" | "effect" | "headType">
): number | null {
  if (e.headType === "income") {
    return signedPaise(e.effect, e.amountPaise);
  }
  if (e.headType === "expense") {
    return -signedPaise(e.effect, e.amountPaise);
  }
  return null;
}

export interface BalanceLine {
  /** Org account, account head or fund id. */
  key: string;
  kind: "account" | "head" | "fund";
  /**
   * A fund that income or expenditure or capital receipts are posted to:
   * its balance at the year's start (fund balance entries, earlier years'
   * capital receipts and the surplus of earlier years), the year's capital
   * receipts (corpus gifts less their refunds) and the year's surplus, or
   * deficit when negative, up to the date. `paise` is their sum.
   */
  movement?: {
    additionsPaise: number;
    openingPaise: number;
    surplusPaise: number;
  };
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
 * each fund's balance entries, capital receipts (corpus gifts, credited
 * straight to the Corpus Fund, never income) and the income less
 * expenditure posted to it the funds. There is no year-close entry: each year's surplus simply stays
 * in its fund (the General Fund for unrestricted income), so a fund's
 * opening for the year starting `startsOn` carries every earlier year's
 * surplus, and the year's own surplus is shown beside it, as the audited
 * statements' fund note does. Every account is listed, even at zero, so the
 * rail and the summary agree; heads and funds appear once they carry an
 * entry.
 */
export function balanceSummary(input: {
  accountIds: readonly string[];
  asOf: string;
  entries: readonly BookEntry[];
  movements: readonly BookMovement[];
  /** The selected year's first day; the year's surplus counts from it. */
  startsOn: string;
}): BalanceSummary {
  const balances = accountBalances(input.movements, input.asOf);
  const assets: BalanceLine[] = input.accountIds.map((id) => ({
    key: id,
    kind: "account",
    paise: balances.get(id) ?? 0,
  }));
  const assetHeads = new Map<string, number>();
  const liabilityHeads = new Map<string, number>();
  const funds = new Map<
    string,
    {
      additionsPaise: number;
      hasMovement: boolean;
      paise: number;
      surplusPaise: number;
    }
  >();
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
    } else {
      const fund = funds.get(e.fundId) ?? {
        additionsPaise: 0,
        hasMovement: false,
        paise: 0,
        surplusPaise: 0,
      };
      const surplus = surplusPaiseOf(e);
      if (surplus === null) {
        fund.paise += paise;
        if (CAPITAL_RECEIPT_HEAD_IDS.includes(e.accountHeadId)) {
          fund.hasMovement = true;
          if (e.economicOn >= input.startsOn) {
            fund.additionsPaise += paise;
          }
        }
      } else {
        fund.hasMovement = true;
        fund.paise += surplus;
        if (e.economicOn >= input.startsOn) {
          fund.surplusPaise += surplus;
        }
      }
      funds.set(e.fundId, fund);
    }
  }
  for (const [key, paise] of assetHeads) {
    assets.push({ key, kind: "head", paise });
  }
  const liabilities: BalanceLine[] = [...liabilityHeads].map(
    ([key, paise]) => ({ key, kind: "head", paise })
  );
  const fundLines: BalanceLine[] = [...funds].map(
    ([key, fund]): BalanceLine => ({
      key,
      kind: "fund",
      paise: fund.paise,
      ...(fund.hasMovement && {
        // The opening is the balance less the year's capital receipts and
        // surplus, so it also holds any other fund-balance entry dated in
        // the year. Today only the opening balances post to the Fund
        // balance head (dated the cutover year's first day, so part of its
        // opening by design); a later in-year fund-balance posting (an
        // adjustment) would show inside the opening here, while the
        // workbook shows it as the year's movement.
        movement: {
          additionsPaise: fund.additionsPaise,
          openingPaise: fund.paise - fund.additionsPaise - fund.surplusPaise,
          surplusPaise: fund.surplusPaise,
        },
      }),
    })
  );
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
