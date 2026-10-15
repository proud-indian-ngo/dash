import { decryptSecretWith, encryptSecretWith } from "./encryption";

/**
 * Pure logic behind `bun run secrets:check` and `bun run secrets:rekey`:
 * which key opens each stored value, and what re-encrypting under the
 * current key would write. No database access and no output of values; the
 * runner in `queries/secrets-rekey.ts` feeds rows in and writes plans out.
 */

export interface KeyPair {
  current: Buffer;
  /** OLD_DATA_ENCRYPTION_KEY, a candidate key the values may have been written with. */
  old: Buffer | null;
}

/** Which key opens a value; "neither" includes values in no known format. */
export type KeyMatch = "current" | "neither" | "old";

export function matchEncrypted(
  keys: KeyPair,
  stored: string,
  context: string
): KeyMatch {
  if (opens(keys.current, stored, context)) {
    return "current";
  }
  if (keys.old && opens(keys.old, stored, context)) {
    return "old";
  }
  return "neither";
}

function opens(key: Buffer, stored: string, context: string): boolean {
  try {
    decryptSecretWith(key, stored, context);
    return true;
  } catch {
    return false;
  }
}

/** Which key a stored keyed hash was computed with, given how to recompute it. */
export function matchHash(
  keys: KeyPair,
  stored: string,
  recompute: (key: Buffer) => string
): KeyMatch {
  if (recompute(keys.current) === stored) {
    return "current";
  }
  if (keys.old && recompute(keys.old) === stored) {
    return "old";
  }
  return "neither";
}

/**
 * - encrypted: AES-GCM values; "neither" needs a person (another key, or damage).
 * - hash: keyed hashes recomputed from stored inputs; "neither" means the
 *   inputs no longer reproduce the hash (for example Postgres reordered the
 *   cells), so the hash cannot be checked, which is not an error.
 * - unverifiable: keyed hashes whose inputs are not stored; counted only.
 */
export type ColumnKind = "encrypted" | "hash" | "unverifiable";

export interface ColumnReport {
  /** Values rewritten under the current key (0 on check and dry runs). */
  changed: number;
  column: string;
  current: number;
  kind: ColumnKind;
  neither: number;
  /** Row IDs of encrypted values neither key opens; never the values. */
  neitherIds: string[];
  old: number;
  /** Values present (for unverifiable columns, the only count). */
  total: number;
}

export interface Update {
  id: string;
  /** The stored value the update replaces, so a concurrent change is not overwritten. */
  previous: string;
  value: string;
}

const emptyReport = (column: string, kind: ColumnKind): ColumnReport => ({
  changed: 0,
  column,
  current: 0,
  kind,
  neither: 0,
  neitherIds: [],
  old: 0,
  total: 0,
});

/**
 * Classifies encrypted values and, when `reencrypt` is set, plans each value
 * only the old key opens re-encrypted under the current key with the same
 * context. Values neither key opens are reported, never touched.
 */
export function planEncrypted(
  column: string,
  rows: readonly { id: string; value: string }[],
  context: (id: string) => string,
  keys: KeyPair,
  reencrypt: boolean
): { report: ColumnReport; updates: Update[] } {
  const report = emptyReport(column, "encrypted");
  const updates: Update[] = [];
  for (const row of rows) {
    report.total += 1;
    const match = matchEncrypted(keys, row.value, context(row.id));
    report[match] += 1;
    if (match === "neither") {
      report.neitherIds.push(row.id);
    } else if (match === "old" && reencrypt && keys.old) {
      const plain = decryptSecretWith(keys.old, row.value, context(row.id));
      updates.push({
        id: row.id,
        previous: row.value,
        value: encryptSecretWith(keys.current, plain, context(row.id)),
      });
    }
  }
  return { report, updates };
}

/**
 * Classifies keyed hashes and, when `rehash` is set, plans each hash the old
 * key reproduces recomputed under the current key.
 */
export function planHashes(
  column: string,
  rows: readonly {
    id: string;
    recompute: (key: Buffer) => string;
    stored: string;
  }[],
  keys: KeyPair,
  rehash: boolean
): { report: ColumnReport; updates: Update[] } {
  const report = emptyReport(column, "hash");
  const updates: Update[] = [];
  for (const row of rows) {
    report.total += 1;
    const match = matchHash(keys, row.stored, row.recompute);
    report[match] += 1;
    if (match === "old" && rehash) {
      updates.push({
        id: row.id,
        previous: row.stored,
        value: row.recompute(keys.current),
      });
    }
  }
  return { report, updates };
}

export function unverifiableReport(
  column: string,
  total: number
): ColumnReport {
  return { ...emptyReport(column, "unverifiable"), total };
}

/** Whether anything is left for a person or for `secrets:rekey` to do. */
export function needsAction(reports: readonly ColumnReport[]): boolean {
  return reports.some(
    (r) =>
      (r.kind === "encrypted" && r.old + r.neither > 0) ||
      (r.kind === "hash" && r.old > 0)
  );
}

/** Counts and row IDs only, one line per column. */
export function formatReports(reports: readonly ColumnReport[]): string {
  const lines: string[] = [];
  for (const r of reports) {
    if (r.kind === "unverifiable") {
      lines.push(
        `${r.column}: ${r.total} keyed hash(es), inputs not stored, cannot be checked`
      );
      continue;
    }
    const neitherLabel =
      r.kind === "encrypted" ? "neither key" : "not reproducible";
    lines.push(
      `${r.column}: ${r.total} total, ${r.current} current key, ${r.old} old key, ${r.neither} ${neitherLabel}${r.changed > 0 ? `, ${r.changed} rewritten` : ""}`
    );
    if (r.neitherIds.length > 0) {
      lines.push(`  neither key opens rows: ${r.neitherIds.join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
