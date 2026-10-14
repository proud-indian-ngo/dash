import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { contribution, contributionRefund } from "@pi-dash/db/schema/income";
import { importRow, pendingRefund } from "@pi-dash/db/schema/private/imports";
import { count, eq, sql } from "drizzle-orm";

/**
 * Database reads for the Razorpay specs, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`: the staged rows and
 * contributions of one payment, its contribution's refunds and status,
 * whether its sync or refund jobs have settled, and the
 * global clearing account setting the spec changes and puts back. Prints
 * one JSON value.
 */

const CLEARING_KEY = "razorpay_clearing_account_id";

/** Outcome and reason of every staged row of a payment. */
async function paymentRows(
  paymentId: string
): Promise<{ outcome: string; reason: string | null }[]> {
  return await db
    .select({ outcome: importRow.outcome, reason: importRow.outcomeReason })
    .from(importRow)
    .where(sql`${importRow.raw}->>'id' = ${paymentId}`);
}

/** Contributions recorded for a payment (its ID is the reference). */
async function paymentContributions(paymentId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(contribution)
    .where(eq(contribution.reference, paymentId));
  return Number(row?.n ?? 0);
}

/** True once no sync job for the payment is queued, retrying or running. */
async function syncJobsSettled(paymentId: string): Promise<boolean> {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job
        where name = 'razorpay-sync-payment'
          and singleton_key = ${paymentId}
          and state in ('created', 'retry', 'active')`
  );
  return Number(row?.n ?? 0) === 0;
}

/** Status and recorded refunds of the contribution a payment became. */
async function paymentRefunds(paymentId: string): Promise<{
  refunds: { amountPaise: number; reference: string | null }[];
  status: string | null;
}> {
  const [gift] = await db
    .select({ id: contribution.id, status: contribution.status })
    .from(contribution)
    .where(eq(contribution.reference, paymentId));
  if (!gift) {
    return { refunds: [], status: null };
  }
  const refunds = await db
    .select({
      amountPaise: contributionRefund.amountPaise,
      reference: contributionRefund.reference,
    })
    .from(contributionRefund)
    .where(eq(contributionRefund.contributionId, gift.id))
    .orderBy(contributionRefund.reference);
  return { refunds, status: gift.status };
}

/** Refunds held for a payment that is not imported yet. */
async function pendingRefunds(paymentId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(pendingRefund)
    .where(eq(pendingRefund.paymentId, paymentId));
  return Number(row?.n ?? 0);
}

/** True once no refund job for the refund is queued, retrying or running. */
async function refundJobsSettled(refundId: string): Promise<boolean> {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job
        where name = 'razorpay-sync-refund'
          and singleton_key = ${refundId}
          and state in ('created', 'retry', 'active')`
  );
  return Number(row?.n ?? 0) === 0;
}

/** The clearing account setting as it is now, to put back after the spec. */
async function readClearingSetting(): Promise<string | null> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, CLEARING_KEY));
  return row?.value ?? null;
}

async function restoreClearingSetting(value: string | null): Promise<void> {
  if (value === null) {
    await db.delete(appConfig).where(eq(appConfig.key, CLEARING_KEY));
    return;
  }
  const now = new Date();
  await db
    .insert(appConfig)
    .values({ key: CLEARING_KEY, updatedAt: now, value })
    .onConflictDoUpdate({
      set: { updatedAt: now, value },
      target: appConfig.key,
    });
}

const [action, arg = ""] = process.argv.slice(2);
let result: unknown;
if (action === "rows") {
  result = await paymentRows(arg);
} else if (action === "contributions") {
  result = await paymentContributions(arg);
} else if (action === "settled") {
  result = await syncJobsSettled(arg);
} else if (action === "refunds") {
  result = await paymentRefunds(arg);
} else if (action === "pending-refunds") {
  result = await pendingRefunds(arg);
} else if (action === "refund-settled") {
  result = await refundJobsSettled(arg);
} else if (action === "read-clearing") {
  result = await readClearingSetting();
} else if (action === "restore-clearing") {
  await restoreClearingSetting(arg === "" ? null : arg);
  result = { restored: true };
} else {
  throw new Error("Unknown Razorpay fixture action");
}
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(result)}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
