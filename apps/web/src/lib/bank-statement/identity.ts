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

/**
 * Lines in file order oldest first: a file whose first line is dated after
 * its last is listed newest first and is turned round, so `position` grows
 * with time within a file. A file whose lines all share a date keeps the
 * order it was given in, so its last line gives the closing balance.
 */
export function positionsFor(
  rows: readonly {
    line: Pick<NormalizedStatementLine, "valueOn"> | null;
    record: { id: string; rowNumber: number };
  }[]
): Map<string, number> {
  const lines = rows.filter((r) => r.line);
  const first = lines[0]?.line?.valueOn ?? "";
  const last = lines.at(-1)?.line?.valueOn ?? "";
  const newestFirst = first > last;
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
