import type { ImportBatchStatus } from "@pi-dash/shared/constants";
import {
  and,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  not,
  notExists,
  sql,
} from "drizzle-orm";

import { db } from ".";
import { importBatch } from "./schema/import-batch";
import { importRow } from "./schema/private/imports";

/**
 * Retention for uploaded import rows (design section 4). `raw` is the only
 * copy of an uploaded file, so it is kept briefly:
 *
 * - rows of a batch that was imported: 180 days after the run, then `raw` is
 *   nulled; the row keeps its outcome and links;
 * - rows of a batch never imported (draft, reviewed, or failed with nothing
 *   imported): 30 days after upload, then the rows are deleted and the batch
 *   is marked expired.
 *
 * Rows of a batch in `importing` are never nulled or deleted: a retry needs
 * them. A batch left `importing` for over a day belongs to a run that died,
 * so it is first reset to `failed`, after which it can be retried or expires
 * like any other failed batch.
 *
 * Rows under legal hold are skipped. Contributions, external identities and
 * collection events are never touched here.
 *
 * The expiry holds the same advisory lock as an import run, so it never sees
 * a batch halfway through a run: rows of a batch whose run commits at that
 * moment are judged by the committed status and counts, never deleted.
 */

/** Serialises import runs with each other and with the retention expiry; transaction-scoped. */
export const IMPORT_RUN_LOCK = sql`select pg_advisory_xact_lock(hashtext('income-import-run'))`;

export const IMPORT_RETENTION_POLICY_VERSION = "import-rows-2026-10";
export const IMPORTED_ROW_RETENTION_DAYS = 180;
export const UNIMPORTED_ROW_RETENTION_DAYS = 30;
export const RETENTION_BASIS_UNIMPORTED = "import_payload_not_imported";
export const RETENTION_BASIS_IMPORTED = "import_payload_imported";
/** A batch `importing` for longer than this belongs to a run that died. */
export const STALE_IMPORTING_MS = 24 * 60 * 60 * 1000;

/** Statuses a batch can be in without any run having committed. */
export const UNIMPORTED_BATCH_STATUSES: readonly ImportBatchStatus[] = [
  "draft",
  "reviewed",
  "failed",
];

/** Calendar date `days` after `isoDate` (yyyy-MM-dd). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Retention columns for a row as it is uploaded. */
export function uploadedRowRetention(today: string) {
  return {
    legalHold: false,
    retainUntil: addDays(today, UNIMPORTED_ROW_RETENTION_DAYS),
    retentionBasis: RETENTION_BASIS_UNIMPORTED,
    retentionPolicyVersion: IMPORT_RETENTION_POLICY_VERSION,
  };
}

/** Retention columns once a run has finished; `today` is the run's date in India. */
export function importedRowRetention(today: string) {
  return {
    retainUntil: addDays(today, IMPORTED_ROW_RETENTION_DAYS),
    retentionBasis: RETENTION_BASIS_IMPORTED,
    retentionPolicyVersion: IMPORT_RETENTION_POLICY_VERSION,
  };
}

export interface ImportRetentionResult {
  deletedRows: number;
  expiredBatches: number;
  failedStaleBatches: number;
  nulledRows: number;
}

/** The statements the expiry runs. */
export interface ImportRetentionStatements {
  deleteUnimportedRows: (today: string) => Promise<number>;
  failStaleImports: (staleBefore: Date) => Promise<number>;
  markEmptyBatchesExpired: () => Promise<number>;
  nullImportedRaw: (today: string) => Promise<number>;
}

/** Runs the statements in one transaction under the import-run lock; injectable so the rules can be tested without a database. */
export interface ImportRetentionStore {
  locked: <T>(
    work: (statements: ImportRetentionStatements) => Promise<T>
  ) => Promise<T>;
}

type RetentionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Rows whose retention date has passed and that are not under legal hold. */
export const importRowDue = (today: string) =>
  and(lt(importRow.retainUntil, today), eq(importRow.legalHold, false));

/** Batches nothing was ever imported from; their rows are deleted, not kept. */
export const neverImported = () =>
  and(
    inArray(importBatch.status, [...UNIMPORTED_BATCH_STATUSES]),
    eq(importBatch.importedCount, 0),
    eq(importBatch.linkedCount, 0)
  );

/** Batches something was imported from and no run holds; their raw cells are nulled when due. */
export const importedAndIdle = () =>
  and(ne(importBatch.status, "importing"), not(neverImported() ?? sql`false`));

/** Batches a run claimed before `staleBefore` and never finished. */
export const staleImporting = (staleBefore: Date) =>
  and(
    eq(importBatch.status, "importing"),
    lt(importBatch.updatedAt, staleBefore)
  );

function statementsFor(tx: RetentionTx): ImportRetentionStatements {
  const unimportedBatchIds = () =>
    tx.select({ id: importBatch.id }).from(importBatch).where(neverImported());
  return {
    deleteUnimportedRows: async (today) => {
      const deleted = await tx
        .delete(importRow)
        .where(
          and(
            importRowDue(today),
            inArray(importRow.batchId, unimportedBatchIds())
          )
        )
        .returning({ id: importRow.id });
      return deleted.length;
    },
    failStaleImports: async (staleBefore) => {
      const failed = await tx
        .update(importBatch)
        .set({ status: "failed", updatedAt: new Date() })
        .where(staleImporting(staleBefore))
        .returning({ id: importBatch.id });
      return failed.length;
    },
    markEmptyBatchesExpired: async () => {
      const expired = await tx
        .update(importBatch)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            neverImported(),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(importRow)
                .where(eq(importRow.batchId, importBatch.id))
            )
          )
        )
        .returning({ id: importBatch.id });
      return expired.length;
    },
    nullImportedRaw: async (today) => {
      const nulled = await tx
        .update(importRow)
        .set({ raw: null })
        .where(
          and(
            importRowDue(today),
            isNotNull(importRow.raw),
            inArray(
              importRow.batchId,
              tx
                .select({ id: importBatch.id })
                .from(importBatch)
                .where(importedAndIdle())
            )
          )
        )
        .returning({ id: importRow.id });
      return nulled.length;
    },
  };
}

export const databaseImportRetentionStore: ImportRetentionStore = {
  locked: async (work) =>
    await db.transaction(async (tx) => {
      await tx.execute(IMPORT_RUN_LOCK);
      return await work(statementsFor(tx));
    }),
};

/**
 * Applies the policy for one day. Idempotent: a second run the same day
 * finds nothing left to do. Batches still importing keep their rows; one
 * importing for over a day is reset to failed first, so it is judged as a
 * failed batch from then on.
 */
export async function expireImportRows(
  today: string,
  store: ImportRetentionStore = databaseImportRetentionStore,
  now: Date = new Date()
): Promise<ImportRetentionResult> {
  return await store.locked(async (statements) => {
    const failedStaleBatches = await statements.failStaleImports(
      new Date(now.getTime() - STALE_IMPORTING_MS)
    );
    const nulledRows = await statements.nullImportedRaw(today);
    const deletedRows = await statements.deleteUnimportedRows(today);
    // Run even when nothing was deleted today, so a batch whose rows went in
    // an earlier, interrupted run is still marked.
    const expiredBatches = await statements.markEmptyBatchesExpired();
    return { deletedRows, expiredBatches, failedStaleBatches, nulledRows };
  });
}
