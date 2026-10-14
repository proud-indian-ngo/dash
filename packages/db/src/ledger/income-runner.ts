import { db } from "..";
import type { LedgerTx } from "./engine";
import {
  type IncomePostingResult,
  type IncomeSource,
  postIncomeSource,
  recordIncomeSourceFailure,
  relatedIncomeSources,
  type SweepResult,
  sweepIncomeSources,
} from "./income-posting";

/**
 * Server only. Runs income posting against the app database, one
 * transaction per source: the `ledger-post-source` job (a source and the
 * sources that depend on it) and the `ledger-post-pending` sweep (the daily
 * job and the Books page's "Post pending").
 */

const inTransaction = <T>(work: (tx: LedgerTx) => Promise<T>) =>
  db.transaction((tx) => work(tx as unknown as LedgerTx));

export interface SourceRunResult {
  related: number;
  result: IncomePostingResult;
}

/** Posts one source, then the sources whose books follow it. */
export async function postIncomeSourceNow(
  source: IncomeSource,
  actorId: string | null = null
): Promise<SourceRunResult> {
  let result: IncomePostingResult;
  try {
    result = await inTransaction((tx) =>
      postIncomeSource(tx, source, { actorId })
    );
  } catch (error) {
    await inTransaction((tx) => recordIncomeSourceFailure(tx, source));
    throw error;
  }
  const related = await inTransaction((tx) => relatedIncomeSources(tx, source));
  for (const next of related) {
    await inTransaction((tx) => postIncomeSource(tx, next, { actorId }));
  }
  return { related: related.length, result };
}

/** Posts everything not up to date, stopping at the deadline (epoch ms). */
export async function postPendingIncome(options: {
  actorId: string | null;
  deadline?: number;
  onFailure?: (source: IncomeSource, error: unknown) => void;
}): Promise<SweepResult> {
  return await sweepIncomeSources({ ...options, run: inTransaction });
}
