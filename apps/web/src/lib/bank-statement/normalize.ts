import type { StatementLineDirection } from "@pi-dash/shared/constants";
import { todayInKolkata } from "@pi-dash/shared/income";
import {
  MAX_AMOUNT_MESSAGE,
  MAX_AMOUNT_PAISE,
  tryRupeesToPaise,
} from "@pi-dash/shared/money";

import type { ImportDateFormat } from "@/lib/income-import/fields";
import { maskIdentifiers, parseDate } from "@/lib/income-import/normalize";

import {
  type AmountLayout,
  BANK_IGNORE_FIELD,
  type BankFieldKey,
  type BankMapping,
} from "./fields";

/**
 * Turns one row of a bank statement into a statement line, or says why it
 * is not one. Pure and client-safe.
 *
 * A row with no readable date, or with a date but no amount, is not a
 * transaction (the account details above the table, an opening balance, a
 * totals line, a disclaimer): it is skipped with a reason, not an error. A
 * row with a date and an amount that cannot be read is an error.
 */

export interface StatementCellIssue {
  field: BankFieldKey | "row";
  message: string;
}

export interface NormalizedStatementLine {
  amountPaise: number;
  /**
   * The narration as printed, for the line hash only (a keyed HMAC): never
   * stored, logged or sent to the browser.
   */
  hashNarration: string;
  /** Running balance as printed, signed (an overdraft is negative). */
  balancePaise: number | null;
  direction: StatementLineDirection;
  /** PAN- and Aadhaar-shaped runs masked to their last four characters. */
  narration: string;
  reference: string;
  valueOn: string;
}

/** Why a row is not a transaction. */
export type StatementSkipReason = "no_date" | "no_amount";

export const STATEMENT_SKIP_MESSAGES: Record<StatementSkipReason, string> = {
  no_amount: "No withdrawal or deposit (an opening or closing balance line)",
  no_date: "No date (a heading, account details or a totals line)",
};

export type StatementRowResult =
  | {
      kind: "line";
      line: NormalizedStatementLine;
      warnings: StatementCellIssue[];
    }
  | { kind: "skip"; reason: StatementSkipReason }
  | { errors: StatementCellIssue[]; kind: "error" };

export interface StatementNormalizeOptions {
  dateFormat: ImportDateFormat;
  layout: AmountLayout;
  /** Today in India; injectable for tests. */
  today?: string;
}

export const MAX_NARRATION_LENGTH = 500;
export const MAX_REFERENCE_LENGTH = 120;

const CURRENCY = /^(?:₹|rs\.?|inr)\s*/i;
// "250.00 Cr", "250.00Cr", "1,234.00(Cr)", "500 Dr."
const TRAILING_SIDE = /\s*\(?\s*(cr|dr)\.?\s*\)?$/i;
const PLAIN = /^\d+(?:\.\d+)?$/;
const INDIAN_GROUPED = /^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/;
const INTERNATIONAL_GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

type AmountCell =
  | { empty: true }
  | { error: string }
  | { paise: number; side: StatementLineDirection | null };

/**
 * An amount cell to signed paise: "1,00,000.50", "₹ 500", "-250.00",
 * "(250.00)" and "250.00 Dr" are all read. A blank cell, "-" or a zero is
 * empty, as banks fill the unused column with them. `side` is the Dr or Cr
 * written after the number, if any.
 */
export function parseStatementAmount(text: string): AmountCell {
  let value = text.replaceAll(" ", " ").trim();
  if (value === "" || value === "-") {
    return { empty: true };
  }
  let side: StatementLineDirection | null = null;
  const trailing = TRAILING_SIDE.exec(value);
  if (trailing) {
    side = trailing[1]?.toLowerCase() === "dr" ? "debit" : "credit";
    value = value.slice(0, trailing.index).trim();
  }
  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1).trim();
  } else if (value.startsWith("+")) {
    value = value.slice(1).trim();
  }
  value = value.replace(CURRENCY, "").replaceAll(" ", "");
  if (
    !(
      PLAIN.test(value) ||
      INDIAN_GROUPED.test(value) ||
      INTERNATIONAL_GROUPED.test(value)
    )
  ) {
    return { error: "Not a number; write it like 1,00,000.50" };
  }
  const paise = tryRupeesToPaise(value.replaceAll(",", ""));
  if (paise === null) {
    return { error: "Amount can have at most 2 decimals" };
  }
  if (paise === 0) {
    return { empty: true };
  }
  if (paise > MAX_AMOUNT_PAISE) {
    return { error: MAX_AMOUNT_MESSAGE };
  }
  return { paise: negative ? -paise : paise, side };
}

const DEBIT_WORDS = new Set(["dr", "d", "debit", "withdrawal", "w", "wd"]);
const CREDIT_WORDS = new Set(["cr", "c", "credit", "deposit", "dep"]);

/** A Dr/Cr cell to a direction. */
export function parseDrCr(text: string): StatementLineDirection | null {
  const key = text.toLowerCase().replaceAll(/[^a-z]/g, "");
  if (DEBIT_WORDS.has(key)) {
    return "debit";
  }
  if (CREDIT_WORDS.has(key)) {
    return "credit";
  }
  return null;
}

// "01/10/26", "01-Oct-26": banks often print two-digit years.
const TIME_SUFFIX = /(?:[T\s]\d{1,2}:\d{2}.*)$/;
const TWO_DIGIT_YEAR = /^(\d{1,2})([-/. ])([a-z]{3,9}|\d{1,2})\2(\d{2})$/i;

/** A statement date to yyyy-MM-dd; a two-digit year is read as 20yy. */
export function parseStatementDate(
  text: string,
  format: ImportDateFormat
): { error: string } | { iso: string } {
  // A trailing time ("01/10/26 10:30") goes before the year is read.
  const value = text.trim().replace(TIME_SUFFIX, "");
  const short = TWO_DIGIT_YEAR.exec(value);
  const expanded =
    short && format !== "ymd"
      ? `${short[1]}${short[2]}${short[3]}${short[2]}20${short[4]}`
      : value;
  return parseDate(expanded, format, "Date");
}

const collapse = (value: string) => value.replaceAll(/\s+/g, " ").trim();

function pick(
  raw: Readonly<Record<string, string>>,
  mapping: BankMapping
): Partial<Record<BankFieldKey, string>> {
  const values: Partial<Record<BankFieldKey, string>> = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (target !== BANK_IGNORE_FIELD) {
      values[target] = collapse(raw[header] ?? "");
    }
  }
  return values;
}

type Signed =
  | { kind: "none" }
  | { error: StatementCellIssue; kind: "error" }
  | { direction: StatementLineDirection; kind: "amount"; paise: number };

function splitAmount(debitText: string, creditText: string): Signed {
  const debit = parseStatementAmount(debitText);
  const credit = parseStatementAmount(creditText);
  if ("error" in debit) {
    return { error: { field: "debit", message: debit.error }, kind: "error" };
  }
  if ("error" in credit) {
    return { error: { field: "credit", message: credit.error }, kind: "error" };
  }
  if ("paise" in debit && "paise" in credit) {
    return {
      error: {
        field: "row",
        message: "Both a withdrawal and a deposit are filled",
      },
      kind: "error",
    };
  }
  if ("paise" in credit && (credit.paise < 0 || credit.side === "debit")) {
    return {
      error: {
        field: "credit",
        message: "A deposit can't be negative or marked Dr",
      },
      kind: "error",
    };
  }
  if ("paise" in debit && debit.side === "credit") {
    return {
      error: { field: "debit", message: "A withdrawal can't be marked Cr" },
      kind: "error",
    };
  }
  if ("paise" in debit) {
    return { direction: "debit", kind: "amount", paise: Math.abs(debit.paise) };
  }
  if ("paise" in credit) {
    return {
      direction: "credit",
      kind: "amount",
      paise: Math.abs(credit.paise),
    };
  }
  return { kind: "none" };
}

function signedAmount(amountText: string): Signed {
  const amount = parseStatementAmount(amountText);
  if ("error" in amount) {
    return { error: { field: "amount", message: amount.error }, kind: "error" };
  }
  if ("empty" in amount) {
    return { kind: "none" };
  }
  let direction: StatementLineDirection = amount.paise < 0 ? "debit" : "credit";
  if (amount.side) {
    direction = amount.side;
  }
  return { direction, kind: "amount", paise: Math.abs(amount.paise) };
}

function indicatorAmount(amountText: string, drCrText: string): Signed {
  const amount = parseStatementAmount(amountText);
  if ("error" in amount) {
    return { error: { field: "amount", message: amount.error }, kind: "error" };
  }
  if ("empty" in amount) {
    return { kind: "none" };
  }
  const direction = parseDrCr(drCrText) ?? amount.side;
  if (!direction) {
    return {
      error: {
        field: "drCr",
        message: "Dr/Cr is not Dr or Cr (or Debit or Credit)",
      },
      kind: "error",
    };
  }
  return { direction, kind: "amount", paise: Math.abs(amount.paise) };
}

function readAmount(
  layout: AmountLayout,
  get: (field: BankFieldKey) => string
): Signed {
  if (layout === "split") {
    return splitAmount(get("debit"), get("credit"));
  }
  if (layout === "indicator") {
    return indicatorAmount(get("amount"), get("drCr"));
  }
  return signedAmount(get("amount"));
}

function readBalance(
  text: string,
  warnings: StatementCellIssue[]
): number | null {
  const balance = parseStatementAmount(text);
  if ("error" in balance) {
    warnings.push({
      field: "balance",
      message: "Balance left out: unreadable",
    });
    return null;
  }
  if ("empty" in balance) {
    return text.trim() === "" || text.trim() === "-" ? null : 0;
  }
  return balance.side === "debit" ? -Math.abs(balance.paise) : balance.paise;
}

// A bank reference after the payment rail: "UPI/412345678901/…",
// "NEFT CR-HDFCN52026101412345678-…".
const RAIL = /\b(?:UPI|IMPS|NEFT|RTGS)\b/i;
const REFERENCE_TOKEN = /^[A-Z0-9]{10,22}$/;

/**
 * The first UTR- or RRN-like token after UPI, IMPS, NEFT or RTGS in a
 * narration: 10 to 22 letters and digits with at least six digits. Read
 * from the narration as printed, before masking, for lines whose file has
 * no reference.
 */
export function referenceFromNarration(narration: string): string {
  const rail = RAIL.exec(narration);
  if (!rail) {
    return "";
  }
  const tokens = narration
    .slice(rail.index + rail[0].length)
    .toUpperCase()
    .split(/[^A-Z0-9]+/);
  return (
    tokens.find(
      (token) =>
        REFERENCE_TOKEN.test(token) && (token.match(/\d/g)?.length ?? 0) >= 6
    ) ?? ""
  );
}

export function normalizeStatementRow(
  raw: Readonly<Record<string, string>>,
  mapping: BankMapping,
  options: StatementNormalizeOptions
): StatementRowResult {
  const values = pick(raw, mapping);
  const get = (field: BankFieldKey) => values[field] ?? "";

  const dateText = get("valueOn");
  const date = parseStatementDate(dateText, options.dateFormat);
  const amount = readAmount(options.layout, get);
  if ("error" in date) {
    // A heading, account details or a totals line: no date at all.
    if (!/\d/.test(dateText)) {
      return { kind: "skip", reason: "no_date" };
    }
    if (amount.kind === "none") {
      return { kind: "skip", reason: "no_amount" };
    }
    // A transaction whose date can't be read: shown, never dropped quietly.
    return {
      errors: [
        { field: "valueOn", message: date.error },
        ...(amount.kind === "error" ? [amount.error] : []),
      ],
      kind: "error",
    };
  }
  if (amount.kind === "none") {
    return { kind: "skip", reason: "no_amount" };
  }
  const errors: StatementCellIssue[] = [];
  if (amount.kind === "error") {
    errors.push(amount.error);
  }
  if (date.iso > (options.today ?? todayInKolkata())) {
    errors.push({ field: "valueOn", message: "Date is in the future" });
  }
  if (amount.kind !== "amount" || errors.length > 0) {
    return { errors, kind: "error" };
  }
  const warnings: StatementCellIssue[] = [];
  const balancePaise =
    get("balance") === "" ? null : readBalance(get("balance"), warnings);
  const narration = get("narration");
  return {
    kind: "line",
    line: {
      amountPaise: amount.paise,
      balancePaise,
      direction: amount.direction,
      hashNarration: narration,
      narration: maskIdentifiers(narration).slice(0, MAX_NARRATION_LENGTH),
      reference: (get("reference") || referenceFromNarration(narration)).slice(
        0,
        MAX_REFERENCE_LENGTH
      ),
      valueOn: date.iso,
    },
    warnings,
  };
}
