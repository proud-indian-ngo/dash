/**
 * Audited figures (the year-end true-up), pure rules shared by the form and
 * the server. The CA corrects the trust's books in their own books after
 * the year ends (depreciation, provisions written back, reclassifications)
 * and signs the statements months later. pi-dash rolls its own closing into
 * the next year, so once a year the treasurer enters the signed balance
 * sheet and pi-dash posts the differences, dated the year's last day, so
 * its closing equals the audited figures line for line and the next year
 * opens from them.
 *
 * Rules (conservative, for the CA to confirm):
 * - Money accounts are never adjusted: a difference means records are
 *   missing or wrong (an unrecorded bank charge, a missing transfer), so it
 *   blocks posting until they are found.
 * - A fixed asset carried at less than the books is depreciation. Any
 *   other difference that lowers the surplus (a new provision, another
 *   asset written down) is "Year-end adjustments (audited)" expense; one
 *   that raises it (a provision written back, an asset written up) is
 *   "Year-end adjustments (audited) — income". The treasurer may pick
 *   another income or expense head per line. Every adjustment lands in
 *   the General Fund; a correction of a restricted fund needs the
 *   transfer between funds as well.
 * - Funds are never adjusted directly: the differences above flow into the
 *   General Fund through the year's surplus, then each fund is checked
 *   against the audited figure. A fund that still differs (the CA moved
 *   money between funds) needs an explicit transfer between funds with a
 *   reason.
 * - The audited figures must balance, and so must the books before them;
 *   the posting balances by construction, so the balance check stays zero.
 */

import { GENERAL_FUND_ID, LEDGER_ACCOUNT_HEAD_IDS } from "./constants";
import {
  accountBalances,
  type BookEntry,
  type BookMovement,
  LEDGER_SOURCE_TYPES,
  type LedgerEffect,
  signedPaise,
  surplusPaiseOf,
} from "./ledger";

export type AuditedLineKind = "account" | "asset" | "liability" | "fund";

export const auditedFiguresStatusValues = ["matched", "skipped"] as const;
export type AuditedFiguresStatus = (typeof auditedFiguresStatusValues)[number];

/** Kinds of a stored audited-figures line: the balance sheet lines and the transfers between funds. */
export const auditedFiguresLineKindValues = [
  "account",
  "asset",
  "liability",
  "fund",
  "fund_transfer",
] as const;
export type AuditedFiguresLineKind =
  (typeof auditedFiguresLineKindValues)[number];

/** A reason (skip, transfer between funds, reversal) is at least this long. */
export const AUDITED_REASON_MIN = 5;
export const AUDITED_REASON_MAX = 500;

/**
 * Sources whose asset entries keep their memo as the asset's own line: the
 * opening balances name each fixed asset, and the audited figures post
 * depreciation against that name. Any other asset entry is part of its
 * head's "other" line. The CA workbook groups the same way.
 */
export const ASSET_LINE_SOURCE_TYPES: readonly string[] = [
  LEDGER_SOURCE_TYPES.openingBalance,
  LEDGER_SOURCE_TYPES.auditedFigures,
];

export const normaliseMemo = (memo: string | null | undefined) =>
  memo?.trim() || null;

/** The asset line an entry belongs to, by its memo, or null for its head's other line. */
export const assetLineMemo = (e: {
  memo: string | null;
  sourceType: string;
}) =>
  ASSET_LINE_SOURCE_TYPES.includes(e.sourceType) ? normaliseMemo(e.memo) : null;

export interface AuditedLineRef {
  accountHeadId?: string | null;
  fundId?: string | null;
  kind: AuditedLineKind;
  memo?: string | null;
  orgAccountId?: string | null;
}

/** A balance sheet line's stable key, the same in the browser and on the server. */
export function auditedLineKey(line: AuditedLineRef): string {
  switch (line.kind) {
    case "account":
      return `account:${line.orgAccountId ?? ""}`;
    case "asset":
      return `asset:${line.accountHeadId ?? ""}:${normaliseMemo(line.memo) ?? ""}`;
    case "liability":
      return `liability:${line.accountHeadId ?? ""}`;
    default:
      return `fund:${line.fundId ?? ""}`;
  }
}

export interface BalanceSheetLine {
  accountHeadId: string | null;
  /** pi-dash's closing at the date, signed (a negative liability is an advance). */
  booksPaise: number;
  fundId: string | null;
  key: string;
  kind: AuditedLineKind;
  memo: string | null;
  orgAccountId: string | null;
}

export type AuditedBookEntry = Pick<
  BookEntry,
  | "accountHeadId"
  | "amountPaise"
  | "economicOn"
  | "effect"
  | "fundId"
  | "headType"
> & { memo: string | null; sourceType: string };

function line(
  ref: AuditedLineRef & { kind: AuditedLineKind },
  booksPaise: number
): BalanceSheetLine {
  return {
    accountHeadId: ref.accountHeadId ?? null,
    booksPaise,
    fundId: ref.fundId ?? null,
    key: auditedLineKey(ref),
    kind: ref.kind,
    memo: ref.kind === "asset" ? normaliseMemo(ref.memo) : null,
    orgAccountId: ref.orgAccountId ?? null,
  };
}

/**
 * Every balance sheet line the books hold at the end of `asOf`: each money
 * account (the ones given, even at zero), each asset line (a fixed asset by
 * its name, else its head), each liability head, and each fund (the ones
 * given, even at zero, and any fund an entry is posted to), a fund carrying
 * the income less expenditure posted to it, as the balance summary does.
 */
export function balanceSheetLines(input: {
  accountIds: readonly string[];
  asOf: string;
  entries: readonly AuditedBookEntry[];
  fundIds: readonly string[];
  movements: readonly BookMovement[];
}): BalanceSheetLine[] {
  const balances = accountBalances(input.movements, input.asOf);
  const accounts = input.accountIds.map((id) =>
    line({ kind: "account", orgAccountId: id }, balances.get(id) ?? 0)
  );
  const others = new Map<string, BalanceSheetLine>();
  const funds = new Map<string, BalanceSheetLine>(
    input.fundIds.map((id) => [id, line({ fundId: id, kind: "fund" }, 0)])
  );
  for (const e of input.entries) {
    if (e.economicOn > input.asOf) {
      continue;
    }
    const paise = signedPaise(e.effect, e.amountPaise);
    if (e.headType === "asset" || e.headType === "liability") {
      const ref: AuditedLineRef = {
        accountHeadId: e.accountHeadId,
        kind: e.headType,
        memo: e.headType === "asset" ? assetLineMemo(e) : null,
      };
      const key = auditedLineKey(ref);
      const existing = others.get(key) ?? line({ ...ref, kind: e.headType }, 0);
      existing.booksPaise += paise;
      others.set(key, existing);
      continue;
    }
    const fund =
      funds.get(e.fundId) ?? line({ fundId: e.fundId, kind: "fund" }, 0);
    fund.booksPaise += surplusPaiseOf(e) ?? paise;
    funds.set(e.fundId, fund);
  }
  const ofKind = (kind: AuditedLineKind) =>
    [...others.values()].filter((l) => l.kind === kind);
  return [
    ...accounts,
    ...ofKind("asset"),
    ...ofKind("liability"),
    ...funds.values(),
  ];
}

// ── The plan ────────────────────────────────────────────────────────────────

export type CounterHeadType = "income" | "expense";

export interface AuditedLineInput {
  /** Signed paise from the statements; null while not entered. */
  auditedPaise: number | null;
  /** Another income or expense head for the difference (asset and liability lines). */
  counterHeadId?: string | null;
  key: string;
}

/** An audited line the books don't have yet, such as a new liability. */
export interface AddedLineInput {
  accountHeadId: string;
  auditedPaise: number | null;
  counterHeadId?: string | null;
  kind: "asset" | "liability";
  memo?: string | null;
}

export interface FundTransferInput {
  amountPaise: number;
  fromFundId: string;
  reason: string;
  toFundId: string;
}

export type AuditedTreatment =
  /** The books agree. */
  | "agrees"
  /** A money account differs: find the missing records; never adjusted. */
  | "find_records"
  /** A fixed asset carried at less: depreciation, by default. */
  | "depreciation"
  /** Any other asset or liability difference: a year-end adjustment. */
  | "adjustment"
  /** A fund: checked after the adjustments, never adjusted directly. */
  | "fund_check"
  | "not_entered";

export interface PlanLine extends BalanceSheetLine {
  added: boolean;
  auditedPaise: number | null;
  /** The head the difference posts against (asset and liability lines with a difference). */
  counterHead: { id: string; type: CounterHeadType } | null;
  /** Audited less the books; null while not entered. */
  differencePaise: number | null;
  treatment: AuditedTreatment;
}

export interface FundCheck {
  /** The books' closing plus the adjustments' surplus and the transfers. */
  afterPaise: number;
  auditedPaise: number | null;
  booksPaise: number;
  /** Audited less `afterPaise`; null while not entered. */
  differencePaise: number | null;
  fundId: string;
  /** The adjustments' surplus that flows into this fund (the General Fund). */
  surplusPaise: number;
  transfersPaise: number;
}

export interface PlanEntry {
  accountHeadId: string;
  amountPaise: number;
  effect: LedgerEffect;
  fundId: string;
  memo: string | null;
}

export type AuditedBlockerCode =
  | "not_entered"
  | "find_records"
  | "audited_unbalanced"
  | "books_unbalanced"
  | "fund_differs"
  | "invalid_transfer"
  | "duplicate_line"
  | "invalid_head";

export interface AuditedBlocker {
  code: AuditedBlockerCode;
  message: string;
}

export interface AuditedTotals {
  assetsPaise: number;
  fundsPaise: number;
  liabilitiesPaise: number;
}

export interface AuditedPlan {
  /** The audited figures' own balance check; null until every line is entered. */
  audited: (AuditedTotals & { balanced: boolean }) | null;
  blockers: AuditedBlocker[];
  books: AuditedTotals & { differencePaise: number };
  canPost: boolean;
  entries: PlanEntry[];
  funds: FundCheck[];
  lines: PlanLine[];
  /** What the adjustments add to the year's surplus (negative: a deficit). */
  surplusPaise: number;
}

const BLOCKER_MESSAGES: Record<AuditedBlockerCode, string> = {
  audited_unbalanced:
    "The audited figures don't balance: assets must equal funds plus liabilities",
  books_unbalanced:
    "The books don't balance at the year end. Ask an administrator to check them before matching the audited figures.",
  duplicate_line:
    "An added line is already listed: enter its audited figure on that line",
  find_records:
    "A money account differs from the audited figures. Money accounts are never adjusted: find the missing or wrong records in its cash book first.",
  fund_differs:
    "A fund still differs from the audited figures: add a transfer between funds, with the reason",
  invalid_head: "Pick an active income or expense head for each difference",
  invalid_transfer:
    "Each transfer between funds needs two different funds, an amount above zero and a reason",
  not_entered:
    "Enter the audited figure for every line (0 when the statements show none)",
};

const DEFAULT_HEADS = {
  depreciation: {
    id: LEDGER_ACCOUNT_HEAD_IDS.depreciation,
    type: "expense" as const,
  },
  yearEndAdjustments: {
    id: LEDGER_ACCOUNT_HEAD_IDS.yearEndAdjustments,
    type: "expense" as const,
  },
  yearEndAdjustmentsIncome: {
    id: LEDGER_ACCOUNT_HEAD_IDS.yearEndAdjustmentsIncome,
    type: "income" as const,
  },
};

/**
 * The entry that carries a difference's effect on the surplus: income up
 * (or expense down) when it raises the surplus, the reverse when it lowers it.
 */
function counterEntry(
  head: { id: string; type: CounterHeadType },
  surplusPaise: number,
  memo: string | null
): PlanEntry {
  const raises = surplusPaise > 0;
  const incomeEffect: LedgerEffect = raises ? "increase" : "decrease";
  const expenseEffect: LedgerEffect = raises ? "decrease" : "increase";
  return {
    accountHeadId: head.id,
    amountPaise: Math.abs(surplusPaise),
    effect: head.type === "income" ? incomeEffect : expenseEffect,
    fundId: GENERAL_FUND_ID,
    memo,
  };
}

const effectOf = (paise: number): LedgerEffect =>
  paise > 0 ? "increase" : "decrease";

export const AUDITED_MEMO_PREFIX = "Per audited accounts";

/**
 * The treatment, counter head and posting of the audited figures against
 * the books. Pure: the form shows it live, the server posts its entries
 * only when it has no blockers.
 */
export function planAuditedFigures(input: {
  added?: readonly AddedLineInput[];
  audited: readonly AuditedLineInput[];
  books: readonly BalanceSheetLine[];
  /** Active income and expense heads the treasurer may pick, by id. */
  counterHeads: ReadonlyMap<string, CounterHeadType>;
  /** A line's name for the entries' memos (an asset's name, a head's). */
  labelOf?: (line: BalanceSheetLine) => string;
  transfers?: readonly FundTransferInput[];
}): AuditedPlan {
  const blockers = new Set<AuditedBlockerCode>();
  const audited = new Map(input.audited.map((a) => [a.key, a]));
  const labelOf = input.labelOf ?? ((l: BalanceSheetLine) => l.memo ?? "");
  const known = new Set(input.books.map((l) => l.key));

  const books: AuditedTotals = {
    assetsPaise: 0,
    fundsPaise: 0,
    liabilitiesPaise: 0,
  };
  for (const l of input.books) {
    addTo(books, l.kind, l.booksPaise);
  }
  const booksDifference =
    books.assetsPaise - books.liabilitiesPaise - books.fundsPaise;
  if (booksDifference !== 0) {
    blockers.add("books_unbalanced");
  }

  const rows: {
    added: boolean;
    line: BalanceSheetLine;
    input: AuditedLineInput;
  }[] = input.books.map((l) => ({
    added: false,
    input: audited.get(l.key) ?? { auditedPaise: null, key: l.key },
    line: l,
  }));
  for (const add of input.added ?? []) {
    const ref = line(
      {
        accountHeadId: add.accountHeadId,
        kind: add.kind,
        memo: add.kind === "asset" ? add.memo : null,
      },
      0
    );
    if (known.has(ref.key)) {
      blockers.add("duplicate_line");
      continue;
    }
    known.add(ref.key);
    // An added liability keeps its name for the memos.
    ref.memo = normaliseMemo(add.memo);
    rows.push({
      added: true,
      input: {
        auditedPaise: add.auditedPaise,
        counterHeadId: add.counterHeadId,
        key: ref.key,
      },
      line: ref,
    });
  }

  const entries: PlanEntry[] = [];
  let surplusPaise = 0;
  const lines: PlanLine[] = [];
  const totals: AuditedTotals = {
    assetsPaise: 0,
    fundsPaise: 0,
    liabilitiesPaise: 0,
  };
  let allEntered = true;
  for (const { added, input: given, line: l } of rows) {
    const auditedPaise = given.auditedPaise;
    if (auditedPaise === null) {
      allEntered = false;
      blockers.add("not_entered");
      lines.push({
        ...l,
        added,
        auditedPaise,
        counterHead: null,
        differencePaise: null,
        treatment: "not_entered",
      });
      continue;
    }
    addTo(totals, l.kind, auditedPaise);
    const differencePaise = auditedPaise - l.booksPaise;
    const base = { ...l, added, auditedPaise, differencePaise };
    if (l.kind === "fund") {
      lines.push({ ...base, counterHead: null, treatment: "fund_check" });
      continue;
    }
    if (differencePaise === 0) {
      lines.push({ ...base, counterHead: null, treatment: "agrees" });
      continue;
    }
    if (l.kind === "account") {
      blockers.add("find_records");
      lines.push({ ...base, counterHead: null, treatment: "find_records" });
      continue;
    }
    const depreciation =
      l.kind === "asset" &&
      l.accountHeadId === LEDGER_ACCOUNT_HEAD_IDS.fixedAssets &&
      differencePaise < 0;
    // An asset up (or a liability down) raises the surplus.
    const surplus = l.kind === "asset" ? differencePaise : -differencePaise;
    let counterHead: { id: string; type: CounterHeadType } =
      DEFAULT_HEADS.yearEndAdjustments;
    if (depreciation) {
      counterHead = DEFAULT_HEADS.depreciation;
    } else if (surplus > 0) {
      counterHead = DEFAULT_HEADS.yearEndAdjustmentsIncome;
    }
    if (given.counterHeadId && given.counterHeadId !== counterHead.id) {
      const type = input.counterHeads.get(given.counterHeadId);
      if (type) {
        counterHead = { id: given.counterHeadId, type };
      } else {
        blockers.add("invalid_head");
      }
    }
    surplusPaise += surplus;
    const label = labelOf(l);
    const memo = label
      ? `${AUDITED_MEMO_PREFIX}: ${label}`
      : AUDITED_MEMO_PREFIX;
    entries.push(
      {
        accountHeadId: l.accountHeadId as string,
        amountPaise: Math.abs(differencePaise),
        effect: effectOf(differencePaise),
        fundId: GENERAL_FUND_ID,
        // An asset's own name keeps it on its line; a liability's is a note.
        memo: l.kind === "asset" ? l.memo : memo,
      },
      counterEntry(counterHead, surplus, memo)
    );
    lines.push({
      ...base,
      counterHead,
      treatment: depreciation ? "depreciation" : "adjustment",
    });
  }

  // Transfers between funds: never income, they only move a fund's share.
  const transfersByFund = new Map<string, number>();
  for (const t of input.transfers ?? []) {
    const reason = t.reason.trim();
    if (
      !(t.fromFundId && t.toFundId) ||
      t.fromFundId === t.toFundId ||
      !(Number.isSafeInteger(t.amountPaise) && t.amountPaise > 0) ||
      reason.length < AUDITED_REASON_MIN
    ) {
      blockers.add("invalid_transfer");
      continue;
    }
    transfersByFund.set(
      t.fromFundId,
      (transfersByFund.get(t.fromFundId) ?? 0) - t.amountPaise
    );
    transfersByFund.set(
      t.toFundId,
      (transfersByFund.get(t.toFundId) ?? 0) + t.amountPaise
    );
    const memo = `${AUDITED_MEMO_PREFIX}: transfer between funds: ${reason}`;
    entries.push(
      {
        accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.fundTransfers,
        amountPaise: t.amountPaise,
        effect: "decrease",
        fundId: t.fromFundId,
        memo,
      },
      {
        accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.fundTransfers,
        amountPaise: t.amountPaise,
        effect: "increase",
        fundId: t.toFundId,
        memo,
      }
    );
  }

  const funds: FundCheck[] = [];
  const fundLines = lines.filter((l) => l.kind === "fund");
  for (const fundId of transfersByFund.keys()) {
    if (!fundLines.some((l) => l.fundId === fundId)) {
      // A transfer into a fund that isn't listed can't be checked.
      blockers.add("invalid_transfer");
    }
  }
  for (const l of fundLines) {
    const fundId = l.fundId as string;
    const fundSurplus = fundId === GENERAL_FUND_ID ? surplusPaise : 0;
    const transfersPaise = transfersByFund.get(fundId) ?? 0;
    const afterPaise = l.booksPaise + fundSurplus + transfersPaise;
    const differencePaise =
      l.auditedPaise === null ? null : l.auditedPaise - afterPaise;
    if (differencePaise !== null && differencePaise !== 0) {
      blockers.add("fund_differs");
    }
    funds.push({
      afterPaise,
      auditedPaise: l.auditedPaise,
      booksPaise: l.booksPaise,
      differencePaise,
      fundId,
      surplusPaise: fundSurplus,
      transfersPaise,
    });
  }

  let auditedCheck: AuditedPlan["audited"] = null;
  if (allEntered) {
    const balanced =
      totals.assetsPaise === totals.fundsPaise + totals.liabilitiesPaise;
    auditedCheck = { ...totals, balanced };
    if (!balanced) {
      blockers.add("audited_unbalanced");
    }
  }

  const ordered = BLOCKER_ORDER.filter((code) => blockers.has(code));
  return {
    audited: auditedCheck,
    blockers: ordered.map((code) => ({
      code,
      message: BLOCKER_MESSAGES[code],
    })),
    books: { ...books, differencePaise: booksDifference },
    canPost: blockers.size === 0,
    entries,
    funds,
    lines,
    surplusPaise,
  };
}

/** The order blockers are shown in: the first one is the posting's refusal. */
const BLOCKER_ORDER: readonly AuditedBlockerCode[] = [
  "books_unbalanced",
  "not_entered",
  "duplicate_line",
  "find_records",
  "invalid_head",
  "audited_unbalanced",
  "invalid_transfer",
  "fund_differs",
];

function addTo(totals: AuditedTotals, kind: AuditedLineKind, paise: number) {
  if (kind === "account" || kind === "asset") {
    totals.assetsPaise += paise;
  } else if (kind === "liability") {
    totals.liabilitiesPaise += paise;
  } else {
    totals.fundsPaise += paise;
  }
}

// ── After the match ─────────────────────────────────────────────────────────

export interface AuditedDrift {
  /** The audited figure; null for a line that appeared after the match. */
  auditedPaise: number | null;
  key: string;
  nowPaise: number;
}

/**
 * Where the books no longer equal a matched document: a line whose closing
 * has moved since, or a line with a balance that wasn't in the books when
 * the figures were matched. Empty while they agree.
 */
export function auditedDrift(
  stored: readonly { auditedPaise: number; key: string }[],
  current: readonly Pick<BalanceSheetLine, "booksPaise" | "key">[]
): AuditedDrift[] {
  const now = new Map(current.map((l) => [l.key, l.booksPaise]));
  const known = new Set(stored.map((l) => l.key));
  const drift: AuditedDrift[] = [];
  for (const line of stored) {
    const nowPaise = now.get(line.key) ?? 0;
    if (nowPaise !== line.auditedPaise) {
      drift.push({ auditedPaise: line.auditedPaise, key: line.key, nowPaise });
    }
  }
  for (const line of current) {
    if (!known.has(line.key) && line.booksPaise !== 0) {
      drift.push({
        auditedPaise: null,
        key: line.key,
        nowPaise: line.booksPaise,
      });
    }
  }
  return drift;
}

// ── The form's payload ──────────────────────────────────────────────────────

export interface EnteredFigure {
  /** Null while not entered. */
  auditedPaise: number | null;
  counterHeadId?: string | null;
  key: string;
}

export interface PayloadLine {
  auditedPaise: number;
  /** The books' figure when the page opened, so the server can tell if they changed. */
  booksPaise: number;
  counterHeadId: string | null;
  key: string;
}

export type AuditedPayload =
  | { lines: PayloadLine[]; ok: true }
  | { missing: string[]; ok: false };

/**
 * The lines the form posts: one per line of the snapshot of the books taken
 * when the page opened, each with the figure typed against that line's key
 * (never its position, so a line added, dropped or reordered since can't
 * carry another line's figure). Refused while a snapshot line has no
 * figure; figures for keys outside the snapshot are ignored.
 */
export function buildAuditedPayload(
  snapshot: readonly Pick<BalanceSheetLine, "booksPaise" | "key">[],
  entered: readonly EnteredFigure[]
): AuditedPayload {
  const byKey = new Map(entered.map((e) => [e.key, e]));
  const missing: string[] = [];
  const lines: PayloadLine[] = [];
  for (const line of snapshot) {
    const figure = byKey.get(line.key);
    if (figure?.auditedPaise === null || figure?.auditedPaise === undefined) {
      missing.push(line.key);
      continue;
    }
    lines.push({
      auditedPaise: figure.auditedPaise,
      booksPaise: line.booksPaise,
      counterHeadId: figure.counterHeadId || null,
      key: line.key,
    });
  }
  return missing.length > 0 ? { missing, ok: false } : { lines, ok: true };
}

/** Whether the live books differ from the snapshot the page opened with. */
export function booksChangedSince(
  snapshot: readonly Pick<BalanceSheetLine, "booksPaise" | "key">[],
  live: readonly Pick<BalanceSheetLine, "booksPaise" | "key">[]
): boolean {
  if (snapshot.length !== live.length) {
    return true;
  }
  const then = new Map(snapshot.map((l) => [l.key, l.booksPaise]));
  return live.some((l) => then.get(l.key) !== l.booksPaise);
}
