import { headerKey } from "@/lib/income-import/fields";

/**
 * The fields a bank statement column can fill, the header spellings that map
 * to each automatically, and how the amount is laid out. Client-safe: the
 * mapping step and the server share it. Generic on purpose: no bank's
 * export is built in until a sample file is available.
 */

export const BANK_FIELD_KEYS = [
  "valueOn",
  "narration",
  "reference",
  "debit",
  "credit",
  "amount",
  "drCr",
  "balance",
] as const;
export type BankFieldKey = (typeof BANK_FIELD_KEYS)[number];

export const BANK_IGNORE_FIELD = "ignore";
export type BankMappingTarget = BankFieldKey | typeof BANK_IGNORE_FIELD;
/** File column header to the field it fills. */
export type BankMapping = Record<string, BankMappingTarget>;

export const BANK_FIELD_LABELS: Record<BankFieldKey, string> = {
  amount: "Amount (signed, or with Dr/Cr)",
  balance: "Balance",
  credit: "Deposit (credit)",
  debit: "Withdrawal (debit)",
  drCr: "Dr/Cr indicator",
  narration: "Description / narration",
  reference: "Reference / cheque no.",
  valueOn: "Date (value date)",
};

/** Value-date spellings win over transaction-date ones when a file has both. */
const VALUE_DATE_SYNONYMS = ["valuedate", "valuedt", "valuedte"];

const SYNONYMS: Record<BankFieldKey, readonly string[]> = {
  amount: ["amount", "amountinr", "transactionamount", "txnamount", "amt"],
  balance: [
    "balance",
    "closingbalance",
    "runningbalance",
    "availablebalance",
    "balanceinr",
    "balanceamt",
  ],
  credit: [
    "credit",
    "creditamount",
    "creditamt",
    "cr",
    "deposit",
    "deposits",
    "depositamt",
    "depositamount",
  ],
  debit: [
    "debit",
    "debitamount",
    "debitamt",
    "dr",
    "withdrawal",
    "withdrawals",
    "withdrawalamt",
    "withdrawalamount",
  ],
  drCr: ["drcr", "crdr", "debitcredit", "creditdebit", "type", "txntype"],
  narration: [
    "narration",
    "description",
    "particulars",
    "remarks",
    "details",
    "transactiondetails",
    "transactiondescription",
    "transactionremarks",
  ],
  reference: [
    "chqrefno",
    "chequerefno",
    "chqno",
    "chequeno",
    "chequenumber",
    "refno",
    "reference",
    "referenceno",
    "refnochequeno",
    "utr",
    "utrno",
    "transactionid",
  ],
  valueOn: [
    ...VALUE_DATE_SYNONYMS,
    "date",
    "txndate",
    "trandate",
    "transactiondate",
    "postingdate",
  ],
};

const SYNONYM_INDEX = new Map<string, BankFieldKey>(
  BANK_FIELD_KEYS.flatMap((field) =>
    SYNONYMS[field].map((synonym) => [synonym, field] as const)
  )
);

const isBankField = (value: string | undefined): value is BankFieldKey =>
  (BANK_FIELD_KEYS as readonly string[]).includes(value ?? "");

/**
 * Suggest a mapping: a column keeps what the last upload for the same bank
 * account mapped it to, otherwise it is matched by synonym; a value-date
 * column takes the date over a transaction-date one. A field is filled at
 * most once.
 */
export function suggestBankMapping(
  headers: readonly string[],
  previous: Readonly<Record<string, string>> | null
): BankMapping {
  const mapping: BankMapping = {};
  const used = new Set<BankFieldKey>();
  const valueDateHeader = headers.find(
    (h) =>
      VALUE_DATE_SYNONYMS.includes(headerKey(h)) &&
      previous?.[h] !== BANK_IGNORE_FIELD
  );
  if (valueDateHeader && !previous?.[valueDateHeader]) {
    mapping[valueDateHeader] = "valueOn";
    used.add("valueOn");
  }
  for (const header of headers) {
    if (mapping[header]) {
      continue;
    }
    const remembered = previous?.[header];
    if (remembered === BANK_IGNORE_FIELD) {
      mapping[header] = BANK_IGNORE_FIELD;
      continue;
    }
    const field = isBankField(remembered)
      ? remembered
      : SYNONYM_INDEX.get(headerKey(header));
    if (field && !used.has(field)) {
      used.add(field);
      mapping[header] = field;
    } else {
      mapping[header] = BANK_IGNORE_FIELD;
    }
  }
  return mapping;
}

/**
 * How the file writes amounts: separate withdrawal and deposit columns
 * (most Indian bank exports), one signed amount column (negative is a
 * withdrawal; a trailing Dr or Cr also counts), or an amount with a Dr/Cr
 * column.
 */
export type AmountLayout = "split" | "signed" | "indicator";

export const AMOUNT_LAYOUT_LABELS: Record<AmountLayout, string> = {
  indicator: "One amount column and a Dr/Cr column",
  signed: "One signed amount column",
  split: "Separate withdrawal and deposit columns",
};

export interface BankMappingCheck {
  duplicates: BankFieldKey[];
  layout: AmountLayout | null;
  /** Why the mapping cannot be used, or null when it can. */
  problem: string | null;
}

export function checkBankMapping(mapping: BankMapping): BankMappingCheck {
  const counts = new Map<BankFieldKey, number>();
  for (const target of Object.values(mapping)) {
    if (target !== BANK_IGNORE_FIELD) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
  }
  const has = (field: BankFieldKey) => counts.has(field);
  const duplicates = [...counts]
    .filter(([, n]) => n > 1)
    .map(([field]) => field);
  let layout: AmountLayout | null = null;
  if (has("debit") && has("credit") && !has("amount") && !has("drCr")) {
    layout = "split";
  } else if (has("amount") && has("drCr") && !has("debit") && !has("credit")) {
    layout = "indicator";
  } else if (has("amount") && !has("drCr") && !has("debit") && !has("credit")) {
    layout = "signed";
  }
  let problem: string | null = null;
  if (duplicates.length > 0) {
    problem = `Mapped more than once: ${duplicates.map((f) => BANK_FIELD_LABELS[f]).join(", ")}.`;
  } else if (!has("valueOn")) {
    problem = "Map the date column.";
  } else if (!layout) {
    problem =
      "Map the amounts one way: withdrawal and deposit columns, or one amount column (signed, or with a Dr/Cr column).";
  }
  return { duplicates, layout, problem };
}

/** Bumped whenever parsing or normalisation changes what a row turns into. */
export const BANK_PARSER_VERSION = 1;

/**
 * Index of the header row of a bank export, which often starts with lines
 * of account details and the statement period: the first row with a date
 * column and at least three filled cells. The first row when none is found.
 */
export function findStatementHeaderRow(
  rows: readonly (readonly string[])[]
): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] ?? []).map((cell) => cell.trim()).filter(Boolean);
    if (
      cells.length >= 3 &&
      cells.some((cell) => SYNONYM_INDEX.get(headerKey(cell)) === "valueOn")
    ) {
      return i;
    }
  }
  return 0;
}

/**
 * What marks a give.do (GiveIndia) payout in a narration, matched
 * case-insensitively. Add a spelling here when a bank prints it another way.
 */
export const GIVEINDIA_NARRATION_PATTERNS: readonly RegExp[] = [
  /\bgive\s*india\b/i,
  /give\s*\.\s*do\b/i,
  /\bgivedo\b/i,
];

export function isGiveIndiaNarration(narration: string): boolean {
  return GIVEINDIA_NARRATION_PATTERNS.some((pattern) =>
    pattern.test(narration)
  );
}
