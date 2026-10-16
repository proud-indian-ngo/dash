import { LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { eq } from "drizzle-orm";

import { db } from "..";
import { appConfig } from "../schema/app-config";
import { fiscalYear } from "../schema/finance-dimensions";
import type { LedgerTx } from "./engine";
import {
  type IncomePostingResult,
  type IncomeSource,
  type ListOptions,
  postIncomeSource,
  recordIncomeSourceFailure,
  relatedIncomeSources,
  type SweepResult,
  sweepIncomeSources,
  type TransactionRunner,
} from "./income-posting";
import { INCOME_RULES_VERSION } from "./income-rules";

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

/** The income rules version every source was last looked at under (`app_config`). */
export const INCOME_RULES_VERSION_KEY = "ledger_income_rules_version";

/** Where the swept rules version is kept: the app database, or a test's transaction. */
export interface RulesVersionStore {
  read: () => Promise<number>;
  record: () => Promise<void>;
}

export function rulesVersionStore(
  handle: Pick<LedgerTx, "insert" | "select">
): RulesVersionStore {
  return {
    read: async () => {
      const [row] = await handle
        .select({ value: appConfig.value })
        .from(appConfig)
        .where(eq(appConfig.key, INCOME_RULES_VERSION_KEY))
        .limit(1);
      const version = Number(row?.value ?? 0);
      return Number.isInteger(version) ? version : 0;
    },
    record: async () => {
      const value = String(INCOME_RULES_VERSION);
      await handle
        .insert(appConfig)
        .values({ key: INCOME_RULES_VERSION_KEY, updatedAt: new Date(), value })
        .onConflictDoUpdate({
          set: { updatedAt: new Date(), value },
          target: appConfig.key,
        });
    },
  };
}

/**
 * Posts everything not up to date, stopping at the deadline (epoch ms).
 * After a rule change (`INCOME_RULES_VERSION` moved on), an incremental run
 * looks at every source instead, so sources posted under the old rule are
 * reversed and reposted on the next run, not the next Sunday; once a run
 * over everything finishes with nothing left or failed, the version is
 * recorded and runs are incremental again. A source in a closed year can't
 * be reposted: it waits ("Year closed") and its books stay as they are.
 */
export async function postPendingIncome(
  options: ListOptions & {
    actorId: string | null;
    deadline?: number;
    now?: () => Date;
    onFailure?: (source: IncomeSource, error: unknown) => void;
    /** Defaults to one app-database transaction per source. */
    run?: TransactionRunner;
    /** Defaults to the app database's `app_config`. */
    versionStore?: RulesVersionStore;
  }
): Promise<SweepResult> {
  const store =
    options.versionStore ??
    rulesVersionStore(db as unknown as Pick<LedgerTx, "insert" | "select">);
  const everything =
    !options.range &&
    (!options.incremental || (await store.read()) < INCOME_RULES_VERSION);
  const result = await sweepIncomeSources({
    ...options,
    incremental: options.incremental && !everything,
    run: options.run ?? inTransaction,
  });
  if (everything && result.remaining === 0 && result.failed === 0) {
    await store.record();
  }
  return result;
}

/**
 * Before a year-close checklist is read or the year closed: posts every
 * source dated in that year, bounded by the deadline, so the waiting check
 * reflects the records as they are now.
 */
export async function postPendingForYear(
  fiscalYearId: string,
  options: {
    actorId: string | null;
    deadline: number;
    onFailure?: (source: IncomeSource, error: unknown) => void;
  }
): Promise<SweepResult | null> {
  const [year] = await db
    .select({ endsOn: fiscalYear.endsOn, startsOn: fiscalYear.startsOn })
    .from(fiscalYear)
    .where(eq(fiscalYear.id, fiscalYearId))
    .limit(1);
  if (!year || year.endsOn < LEDGER_CUTOVER_ON) {
    return null;
  }
  return await postPendingIncome({ ...options, range: year });
}
