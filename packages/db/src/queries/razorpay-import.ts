import { RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY } from "@pi-dash/shared/contribution-channel";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  max,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import { db } from "..";
import {
  awaitingOutcomeRetention,
  importedRowRetention,
} from "../import-retention";
import { appConfig } from "../schema/app-config";
import { orgAccount } from "../schema/finance-dimensions";
import { importBatch } from "../schema/import-batch";
import { externalIdentity, importRow } from "../schema/private/imports";
import {
  countImportBatchRows,
  type ImportBatchRow,
  type ImportRowRecord,
  type ImportTx,
  updateImportBatch,
  type WaitingReason,
  withImportTransaction,
} from "./income-import";

type Reader = Pick<typeof db, "select">;

/**
 * Database access for Razorpay Payment Page ingestion. Payments are staged
 * as rows of a per-day `razorpay_api` import batch, so they share the CSV
 * import's review flow, identities and retention. Settings live in
 * `app_config`; no secret is ever stored.
 */

export const RAZORPAY_CONFIG_KEYS = {
  clearingAccountId: RAZORPAY_CLEARING_ACCOUNT_CONFIG_KEY,
  /** JSON: the last finished reconcile run (window, counts, ok or failed); no personal data. */
  lastReconcile: "razorpay_last_reconcile",
  lastWebhookAt: "razorpay_last_webhook_at",
  notesKeys: "razorpay_notes_keys",
  /** JSON: the reconcile run queued or running now, with its progress; empty when none. */
  reconcileRun: "razorpay_reconcile_run",
} as const;

export async function readRazorpayConfig(
  executor: Reader = db
): Promise<Map<string, string>> {
  const rows = await executor
    .select({ key: appConfig.key, value: appConfig.value })
    .from(appConfig)
    .where(inArray(appConfig.key, Object.values(RAZORPAY_CONFIG_KEYS)));
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function writeRazorpayConfig(
  values: Partial<Record<keyof typeof RAZORPAY_CONFIG_KEYS, string>>,
  executor: Pick<typeof db, "insert"> = db
): Promise<void> {
  const now = new Date();
  for (const [name, value] of Object.entries(values)) {
    const key = RAZORPAY_CONFIG_KEYS[name as keyof typeof RAZORPAY_CONFIG_KEYS];
    await executor
      .insert(appConfig)
      .values({ key, updatedAt: now, value })
      .onConflictDoUpdate({
        set: { updatedAt: now, value },
        target: appConfig.key,
      });
  }
}

/** The account if it can take Razorpay money: active and a gateway clearing account. */
export async function findClearingAccount(
  id: string,
  executor: Reader = db
): Promise<{ id: string; name: string } | null> {
  const [row] = await executor
    .select({ id: orgAccount.id, name: orgAccount.name })
    .from(orgAccount)
    .where(
      and(
        eq(orgAccount.id, id),
        eq(orgAccount.active, true),
        eq(orgAccount.kind, "gateway_clearing")
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * One transaction serialised against other stagings, so two deliveries of
 * the same payment, or the first two payments of a day, never race to
 * create duplicate rows or batches.
 */
export async function withRazorpayStageTransaction<T>(
  run: (tx: ImportTx) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('razorpay-stage'))`
    );
    return await run(tx);
  });
}

/** The latest Razorpay batch with this key (mode and India day). */
export async function findRazorpayBatch(
  tx: ImportTx,
  key: string
): Promise<ImportBatchRow | null> {
  const [row] = await tx
    .select()
    .from(importBatch)
    .where(
      and(eq(importBatch.source, "razorpay_api"), eq(importBatch.fileHash, key))
    )
    .orderBy(desc(importBatch.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertRazorpayBatch(
  tx: ImportTx,
  values: typeof importBatch.$inferInsert
): Promise<ImportBatchRow> {
  const [row] = await tx.insert(importBatch).values(values).returning();
  if (!row) {
    throw new Error("Razorpay batch could not be created");
  }
  return row;
}

/**
 * How a payment's staged row is recognised: by the payment ID kept in
 * `external_id` (which survives retention), by the ID in its values (rows
 * staged before `external_id` existed), or by the external identity it was
 * imported or linked under.
 */
export function razorpayPaymentRowMatch(paymentId: string): SQL {
  return or(
    eq(importRow.externalId, paymentId),
    sql`${importRow.raw}->>'id' = ${paymentId}`,
    sql`${importRow.externalIdentityId} in (
      select ${externalIdentity.id} from ${externalIdentity}
      where ${externalIdentity.provider} = 'razorpay'
        and ${externalIdentity.entityType} = 'payment'
        and ${externalIdentity.externalId} = ${paymentId}
    )`
  ) as SQL;
}

/**
 * The staged row of a payment, looked up in the batches of its day only (a
 * payment's day never changes). A row keeps its payment ID in `external_id`
 * after retention nulls its values, so a payment that was skipped or failed
 * is found again and a redelivery or a backfill never stages it twice.
 */
export async function findRazorpayPaymentRow(
  executor: Reader,
  key: string,
  paymentId: string
): Promise<(ImportRowRecord & { batch: ImportBatchRow }) | null> {
  const [row] = await executor
    .select({ batch: importBatch, row: importRow })
    .from(importRow)
    .innerJoin(importBatch, eq(importBatch.id, importRow.batchId))
    .where(
      and(
        eq(importBatch.source, "razorpay_api"),
        eq(importBatch.fileHash, key),
        razorpayPaymentRowMatch(paymentId)
      )
    )
    .orderBy(importRow.createdAt)
    .limit(1);
  return row ? { ...row.row, batch: row.batch } : null;
}

/** Adds a pending row at the end of a batch and counts it as waiting. */
export async function appendImportRow(
  tx: ImportTx,
  values: Omit<typeof importRow.$inferInsert, "outcome" | "rowNumber">
): Promise<void> {
  const [last] = await tx
    .select({ n: max(importRow.rowNumber) })
    .from(importRow)
    .where(eq(importRow.batchId, values.batchId));
  await tx
    .insert(importRow)
    .values({ ...values, rowNumber: (last?.n ?? 0) + 1 });
  await tx
    .update(importBatch)
    .set({
      pendingCount: sql`${importBatch.pendingCount} + 1`,
      rowCount: sql`${importBatch.rowCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(importBatch.id, values.batchId));
}

/** Leaves a row pending with the reason it waits; it counts as waiting. */
export async function markImportRowWaiting(
  tx: ImportTx,
  rowId: string,
  reason: WaitingReason
): Promise<void> {
  await tx
    .update(importRow)
    .set({ outcomeReason: reason })
    .where(and(eq(importRow.id, rowId), eq(importRow.outcome, "pending")));
}

/** Refreshes a row still waiting to be imported with the API's copy of the payment. */
export async function replacePendingRaw(
  tx: ImportTx,
  rowId: string,
  raw: Record<string, string>,
  rawHash: string
): Promise<void> {
  await tx
    .update(importRow)
    .set({ raw, rawHash })
    .where(and(eq(importRow.id, rowId), eq(importRow.outcome, "pending")));
}

/**
 * Records that a staged payment cannot be imported: Razorpay does not know
 * it, or it is no longer captured. Its retention starts, as for any row
 * with an outcome.
 */
export async function failPendingPaymentRow(
  tx: ImportTx,
  rowId: string,
  reason: "not_captured" | "not_found",
  now: Date,
  today: string
): Promise<boolean> {
  const rows = await tx
    .update(importRow)
    .set({
      ...importedRowRetention(today),
      decidedAt: now,
      decidedBy: null,
      outcome: "error",
      outcomeReason: reason,
    })
    .where(and(eq(importRow.id, rowId), eq(importRow.outcome, "pending")))
    .returning({ id: importRow.id });
  return rows.length > 0;
}

/** Outcome reasons a later captured copy of the payment can clear. */
export const REOPENABLE_REASONS = ["not_captured", "not_found"] as const;

/**
 * Puts a payment that failed for want of a captured copy back in the
 * queue with the new copy: pending, waiting, kept until it has an outcome.
 */
export async function reopenFailedPaymentRow(
  tx: ImportTx,
  rowId: string,
  raw: Record<string, string>,
  rawHash: string
): Promise<void> {
  const { legalHold: _, ...retention } = awaitingOutcomeRetention();
  await tx
    .update(importRow)
    .set({
      ...retention,
      decidedAt: null,
      decidedBy: null,
      outcome: "pending",
      outcomeReason: "queued",
      raw,
      rawHash,
    })
    .where(
      and(
        eq(importRow.id, rowId),
        eq(importRow.outcome, "error"),
        inArray(importRow.outcomeReason, [...REOPENABLE_REASONS])
      )
    );
}

/**
 * Payments waiting for one of these reasons, with the key of their batch,
 * so their sync jobs can be queued again.
 */
export async function listWaitingPayments(
  reasons: readonly WaitingReason[]
): Promise<{ batchKey: string; paymentId: string }[]> {
  const rows = await db
    .select({
      batchKey: importBatch.fileHash,
      paymentId: sql<string | null>`${importRow.raw}->>'id'`,
    })
    .from(importRow)
    .innerJoin(importBatch, eq(importBatch.id, importRow.batchId))
    .where(
      and(
        eq(importBatch.source, "razorpay_api"),
        eq(importRow.outcome, "pending"),
        inArray(importRow.outcomeReason, [...reasons])
      )
    );
  return rows.flatMap((row) =>
    row.paymentId ? [{ batchKey: row.batchKey, paymentId: row.paymentId }] : []
  );
}

/** Razorpay payments waiting, by reason, for the settings page. */
export async function countRazorpayWaitingByReason(): Promise<
  Map<string, number>
> {
  const rows = await db
    .select({ n: count(), reason: importRow.outcomeReason })
    .from(importRow)
    .innerJoin(importBatch, eq(importBatch.id, importRow.batchId))
    .where(
      and(
        eq(importBatch.source, "razorpay_api"),
        eq(importRow.outcome, "pending")
      )
    )
    .groupBy(importRow.outcomeReason);
  return new Map(rows.map((row) => [row.reason ?? "", Number(row.n)]));
}

/**
 * Points Razorpay batches at the chosen account when they have none, or
 * when theirs is no longer an active gateway clearing account. Contributions
 * already imported keep the account they were recorded into.
 */
export async function attachClearingAccount(
  tx: Pick<typeof db, "select" | "update">,
  accountId: string
): Promise<number> {
  const rows = await tx
    .update(importBatch)
    .set({ orgAccountId: accountId, updatedAt: new Date() })
    .where(
      and(
        eq(importBatch.source, "razorpay_api"),
        or(
          isNull(importBatch.orgAccountId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(orgAccount)
              .where(
                and(
                  eq(orgAccount.id, importBatch.orgAccountId),
                  eq(orgAccount.active, true),
                  eq(orgAccount.kind, "gateway_clearing")
                )
              )
          )
        )
      )
    )
    .returning({ id: importBatch.id });
  return rows.length;
}

/** Rows of Razorpay batches still waiting for a reviewer, for the settings page. */
export async function countRazorpayPending(): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`coalesce(sum(${importBatch.pendingCount}), 0)::int`,
    })
    .from(importBatch)
    .where(eq(importBatch.source, "razorpay_api"));
  return Number(row?.n ?? 0);
}

/**
 * Payments stuck waiting on their sync: queued for longer than a job could
 * take (a job that expired, or a fetch-by-ID job that never staged a day),
 * or left `sync_failed` after the job's last retry. The reconcile run syncs
 * each once more.
 */
export async function listStaleRazorpayRows(
  stagedBefore: Date
): Promise<{ batchId: string; batchKey: string; paymentId: string }[]> {
  const rows = await db
    .select({
      batchId: importBatch.id,
      batchKey: importBatch.fileHash,
      paymentId: sql<string | null>`${importRow.raw}->>'id'`,
    })
    .from(importRow)
    .innerJoin(importBatch, eq(importBatch.id, importRow.batchId))
    .where(
      and(
        eq(importBatch.source, "razorpay_api"),
        eq(importRow.outcome, "pending"),
        inArray(importRow.outcomeReason, ["queued", "sync_failed"]),
        lt(importRow.createdAt, stagedBefore)
      )
    )
    .orderBy(importRow.createdAt);
  return rows.flatMap((row) =>
    row.paymentId
      ? [
          {
            batchId: row.batchId,
            batchKey: row.batchKey,
            paymentId: row.paymentId,
          },
        ]
      : []
  );
}

/**
 * Recounts each batch's synced counters from its rows, serialised with the
 * import runs, so a count a racing job and webhook left one off is put
 * right.
 */
export async function recountImportBatches(
  batchIds: Iterable<string>
): Promise<number> {
  let recounted = 0;
  for (const batchId of new Set(batchIds)) {
    await withImportTransaction(async (tx) => {
      await updateImportBatch(
        batchId,
        await countImportBatchRows(tx, batchId),
        tx
      );
    });
    recounted += 1;
  }
  return recounted;
}

/**
 * Whether pg-boss holds an open `razorpay-reconcile` job (queued, retrying
 * or running). The queue allows one at a time, so this is what decides
 * whether a new run can be sent.
 */
export async function hasOpenReconcileJob(): Promise<boolean> {
  try {
    const [row] = await db.execute<{ one: number }>(
      sql`select 1 as one from pgboss.job
          where name = 'razorpay-reconcile'
            and state in ('created', 'retry', 'active')
          limit 1`
    );
    return row !== undefined;
  } catch (error) {
    // Before pg-boss has created its schema there can be no job. The
    // Postgres code sits on the error or, through drizzle, on its cause.
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current instanceof Object; depth += 1) {
      const e = current as { cause?: unknown; code?: unknown; errno?: unknown };
      if ([e.code, e.errno].some((c) => c === "42P01" || c === "3F000")) {
        return false;
      }
      current = e.cause;
    }
    throw error;
  }
}

/**
 * Writes a Razorpay setting only while it still holds `expected`, so a
 * request putting back its own state never overwrites another's.
 */
export async function replaceRazorpayConfigIf(
  name: keyof typeof RAZORPAY_CONFIG_KEYS,
  expected: string,
  value: string
): Promise<boolean> {
  const rows = await db
    .update(appConfig)
    .set({ updatedAt: new Date(), value })
    .where(
      and(
        eq(appConfig.key, RAZORPAY_CONFIG_KEYS[name]),
        eq(appConfig.value, expected)
      )
    )
    .returning({ key: appConfig.key });
  return rows.length > 0;
}
