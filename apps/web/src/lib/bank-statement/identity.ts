import { keyedHash } from "@/lib/income-import/identity";

import type { NormalizedStatementLine } from "./normalize";

/**
 * Server-only (keyed hashes). How a statement line is recognised across
 * uploads: a keyed hash (`h1:`, the import hashing scheme) of the account,
 * date, direction, amount, reference, folded narration as printed (not
 * masked) and printed balance,
 * plus the line's occurrence among identical lines of the same file. Two
 * identical ₹500 UPI credits on one day are lines 1 and 2 in every upload
 * that has both, so overlapping uploads (1-31 Oct, then 15 Oct-15 Nov)
 * store each line once and still keep both.
 */

const fold = (value: string) =>
  value.toLowerCase().replaceAll(/\s+/g, " ").trim();

/** The fields that make two lines the same, before their occurrence. */
export function lineBaseKey(
  orgAccountId: string,
  line: NormalizedStatementLine
): string {
  return JSON.stringify([
    orgAccountId,
    line.valueOn,
    line.direction,
    line.amountPaise,
    fold(line.reference),
    fold(line.hashNarration),
    line.balancePaise,
  ]);
}

export function statementLineHash(baseKey: string, occurrence: number): string {
  return keyedHash("statement_line", `${baseKey}\u0000${occurrence}`);
}

/**
 * Each line's hash, in file order: the nth line with the same base key gets
 * occurrence n. `lines` holds null for rows that are not lines.
 */
export function statementLineHashes(
  orgAccountId: string,
  lines: readonly (NormalizedStatementLine | null)[]
): (string | null)[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    if (!line) {
      return null;
    }
    const base = lineBaseKey(orgAccountId, line);
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return statementLineHash(base, occurrence);
  });
}

type OrderedLine = Pick<
  NormalizedStatementLine,
  "amountPaise" | "balancePaise" | "direction" | "valueOn"
>;

const signed = (line: OrderedLine) =>
  line.direction === "credit" ? line.amountPaise : -line.amountPaise;

/**
 * Whether the printed balances say the file is listed newest first: each
 * line's balance is the next line's balance plus its own amount, rather
 * than the previous line's balance plus the next amount. Null when the
 * balances say neither (or are missing).
 */
function newestFirstByBalance(lines: readonly OrderedLine[]): boolean | null {
  let oldestFirst = 0;
  let newestFirst = 0;
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const a = lines[i];
    const b = lines[i + 1];
    if (!(a && b) || a.balancePaise === null || b.balancePaise === null) {
      continue;
    }
    if (b.balancePaise === a.balancePaise + signed(b)) {
      oldestFirst += 1;
    }
    if (a.balancePaise === b.balancePaise + signed(a)) {
      newestFirst += 1;
    }
  }
  if (newestFirst === oldestFirst) {
    return null;
  }
  return newestFirst > oldestFirst;
}

/**
 * Lines in file order oldest first, so `position` grows with time within a
 * file and the last line gives the closing balance. A file whose first line
 * is dated after its last is listed newest first and is turned round. When
 * the first and last dates tie (a one-day file), the running balances
 * decide when they can; otherwise the file keeps the order it was given in.
 */
export function positionsFor(
  rows: readonly {
    line: OrderedLine | null;
    record: { id: string; rowNumber: number };
  }[]
): Map<string, number> {
  const lines = rows.flatMap((r) => (r.line ? [r.line] : []));
  const first = lines[0]?.valueOn ?? "";
  const last = lines.at(-1)?.valueOn ?? "";
  const newestFirst =
    first === last ? (newestFirstByBalance(lines) ?? false) : first > last;
  const positions = new Map<string, number>();
  for (const row of rows) {
    positions.set(
      row.record.id,
      newestFirst
        ? rows.length - row.record.rowNumber + 1
        : row.record.rowNumber
    );
  }
  return positions;
}
