import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { db } from "..";
import { appConfig } from "../schema/app-config";
import { orgAccount } from "../schema/finance-dimensions";
import { importBatch } from "../schema/import-batch";
import { importRow } from "../schema/private/imports";
import type {
  ImportBatchRow,
  ImportRowRecord,
  ImportTx,
} from "./income-import";

/**
 * Database access for Razorpay Payment Page ingestion. Payments are staged
 * as rows of a per-day `razorpay_api` import batch, so they share the CSV
 * import's review flow, identities and retention. Settings live in
 * `app_config`; no secret is ever stored.
 */

export const RAZORPAY_CONFIG_KEYS = {
  clearingAccountId: "razorpay_clearing_account_id",
  lastWebhookAt: "razorpay_last_webhook_at",
  notesKeys: "razorpay_notes_keys",
} as const;

export async function readRazorpayConfig(): Promise<Map<string, string>> {
  const rows = await db
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
  id: string
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
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
 * The staged row of a payment, looked up in the batches of its day only (a
 * payment's day never changes). Rows whose raw values expired are not
 * found; their external identity still prevents a second contribution.
 */
export async function findRazorpayPaymentRow(
  executor: Pick<typeof db, "select">,
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
        sql`${importRow.raw}->>'id' = ${paymentId}`
      )
    )
    .orderBy(importRow.createdAt)
    .limit(1);
  return row ? { ...row.row, batch: row.batch } : null;
}

/** Adds a row at the end of a batch and counts it. */
export async function appendImportRow(
  tx: ImportTx,
  values: Omit<typeof importRow.$inferInsert, "rowNumber">
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
      rowCount: sql`${importBatch.rowCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(importBatch.id, values.batchId));
}

/** Leaves a row pending with the reason it waits; it counts as needing review. */
export async function markImportRowWaiting(
  tx: ImportTx,
  rowId: string,
  reason: "needs_review" | "no_clearing_account"
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

/** Points Razorpay batches opened before a clearing account was chosen at it. */
export async function attachClearingAccount(
  tx: Pick<typeof db, "update">,
  accountId: string
): Promise<number> {
  const rows = await tx
    .update(importBatch)
    .set({ orgAccountId: accountId, updatedAt: new Date() })
    .where(
      and(
        eq(importBatch.source, "razorpay_api"),
        isNull(importBatch.orgAccountId)
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
