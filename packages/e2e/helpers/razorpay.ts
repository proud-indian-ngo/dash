import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import {
  recordRazorpaySettlement,
  type SettlementToRecord,
} from "@pi-dash/db/queries/razorpay-settlements";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "@pi-dash/db/schema/gateway-settlement";
import { contribution, contributionRefund } from "@pi-dash/db/schema/income";
import { role, rolePermission } from "@pi-dash/db/schema/permission";
import { importRow, pendingRefund } from "@pi-dash/db/schema/private/imports";
import { count, eq, sql } from "drizzle-orm";

/**
 * Database reads for the Razorpay specs, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`: the staged rows and
 * contributions of one payment, its contribution's refunds and status,
 * whether its sync or refund jobs have settled, and the
 * global clearing account setting the spec changes and puts back. Also
 * records a settlement through the real write path (E2E has no API key
 * secret, so nothing can fetch one from Razorpay), reads its lines' links,
 * and makes a user whose role has donors.view only. Prints one JSON value.
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

/**
 * Records a test-mode settlement as the sync would, so its lines link to
 * whatever payments and refunds are already recorded.
 */
async function recordSettlement(json: string) {
  const input = JSON.parse(json) as Omit<
    SettlementToRecord,
    "lines" | "settlementFeePaise" | "settlementTaxPaise" | "unreadableLines"
  > &
    Partial<
      Pick<
        SettlementToRecord,
        "settlementFeePaise" | "settlementTaxPaise" | "unreadableLines"
      >
    > & {
      lines: (Omit<SettlementToRecord["lines"][number], "settledAt"> & {
        settledAt: string;
      })[];
    };
  return await recordRazorpaySettlement({
    settlementFeePaise: null,
    settlementTaxPaise: null,
    unreadableLines: 0,
    ...input,
    lines: input.lines.map((line) => ({
      ...line,
      settledAt: new Date(line.settledAt),
    })),
  });
}

/** Each line of a settlement and whether it is linked. */
async function settlementLinks(externalId: string) {
  return await db
    .select({
      externalId: gatewaySettlementItem.externalId,
      linked: sql<boolean>`(${gatewaySettlementItem.contributionId} is not null or ${gatewaySettlementItem.contributionRefundId} is not null)`,
    })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .where(eq(gatewaySettlement.externalId, externalId))
    .orderBy(gatewaySettlementItem.externalId);
}

const DONORS_VIEWER_ROLE = "e2e_donors_viewer";
const DONORS_VIEWER = {
  email: "e2e-donors-viewer@pi-dash.test",
  password: "E2eDonorsViewer123!",
};

/** A user whose only permission is donors.view, for the Settlements tab's denial. */
async function donorsViewer() {
  await db
    .insert(role)
    .values({
      description: "E2E: sees donors and income, not finance",
      id: DONORS_VIEWER_ROLE,
      isSystem: false,
      name: "E2E Donors Viewer",
    })
    .onConflictDoNothing();
  await db
    .insert(rolePermission)
    .values({ permissionId: "donors.view", roleId: DONORS_VIEWER_ROLE })
    .onConflictDoNothing();
  let existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, DONORS_VIEWER.email),
  });
  if (!existing) {
    await auth.api.createUser({
      body: { ...DONORS_VIEWER, name: "E2E Donors Viewer" },
    });
    existing = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, DONORS_VIEWER.email),
    });
  }
  if (!existing) {
    throw new Error("Unable to create the donors viewer");
  }
  await db
    .update(user)
    .set({
      banned: false,
      emailVerified: true,
      isActive: true,
      role: DONORS_VIEWER_ROLE,
    })
    .where(eq(user.id, existing.id));
  return DONORS_VIEWER;
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
} else if (action === "record-settlement") {
  result = await recordSettlement(arg);
} else if (action === "settlement-links") {
  result = await settlementLinks(arg);
} else if (action === "donors-viewer") {
  result = await donorsViewer();
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
