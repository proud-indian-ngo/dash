import { keyedHash } from "@/lib/income-import/identity";

import type { NormalizedStatementLine } from "./normalize";

/**
 * Server-only (keyed hashes). How a statement line is recognised across
 * uploads: a keyed hash (`h1:`, the import hashing scheme) of the account,
 * date, direction, amount, reference, folded narration and printed balance,
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
    fold(line.narration),
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
