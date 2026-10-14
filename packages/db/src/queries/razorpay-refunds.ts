import { and, count, eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { planRefund } from "../refund-rules";
import { contribution, contributionRefund } from "../schema/income";
import { externalIdentity, pendingRefund } from "../schema/private/imports";
import { type ImportTx, withImportTransaction } from "./income-import";

/**
 * Database side of Razorpay refunds. A processed refund is recorded once
 * against the contribution its payment became: its refund ID is an external
 * identity (entity type `refund`), so applying it again is a no-op, and a
 * later copy with a different amount is flagged once, never written over.
 * The contribution's status moves to `refunded` once its refunds cover it,
 * unless it is receipted (flagged, never changed) or reversed (recorded
 * only). No posting and no movement is made.
 *
 * A refund whose payment is not a contribution yet is held in
 * `private.pending_refund` (IDs, amount, time; no personal data) and
 * applied by the import transaction that creates or links the payment's
 * contribution. Every apply runs under the import run lock, so a refund
 * held at the moment its payment is imported is never missed by both.
 */

export type RefundApplyResult =
  /** Recorded now. */
  | "applied"
  /** Recorded before with the same amount, or a change already flagged. */
  | "already_applied"
  /** Recorded before with a different amount: flagged, not changed. */
  | "amount_changed"
  /** The payment is not a contribution yet; the refund is held for it. */
  | "payment_not_imported";

export interface RefundApplyOutcome {
  contributionId: string | null;
  result: RefundApplyResult;
  /** True when this refund moved the contribution to `refunded`. */
  statusChanged: boolean;
}

export interface RefundToApply {
  amountPaise: number;
  currency: string;
  /** Live or test: the provider account of both identities. */
  mode: string;
  paymentId: string;
  /** Fingerprint of the refund's amount and payment; a change is flagged. */
  payloadHash: string;
  /** When the provider made the refund. */
  refundedAt: Date;
  /** India date of the refund. */
  refundedOn: string;
  refundId: string;
}

const identityWhere = (
  mode: string,
  entityType: "payment" | "refund",
  externalId: string
) =>
  and(
    eq(externalIdentity.provider, "razorpay"),
    eq(externalIdentity.providerAccount, mode),
    eq(externalIdentity.entityType, entityType),
    eq(externalIdentity.externalId, externalId)
  );

const NOT_IMPORTED: RefundApplyOutcome = {
  contributionId: null,
  result: "payment_not_imported",
  statusChanged: false,
};

async function forgetPending(
  tx: ImportTx,
  mode: string,
  refundId: string
): Promise<void> {
  await tx
    .delete(pendingRefund)
    .where(
      and(
        eq(pendingRefund.provider, "razorpay"),
        eq(pendingRefund.providerAccount, mode),
        eq(pendingRefund.refundId, refundId)
      )
    );
}

const storedRefundWhere = (contributionId: string, refundId: string) =>
  and(
    eq(contributionRefund.contributionId, contributionId),
    eq(contributionRefund.source, "razorpay"),
    eq(contributionRefund.reference, refundId)
  );

/** Applies one refund inside a transaction that holds the import run lock. */
async function applyIn(
  tx: ImportTx,
  refund: RefundToApply,
  now: Date
): Promise<RefundApplyOutcome> {
  const [payment] = await tx
    .select({ contributionId: externalIdentity.contributionId })
    .from(externalIdentity)
    .where(identityWhere(refund.mode, "payment", refund.paymentId))
    .limit(1);
  if (!payment) {
    return NOT_IMPORTED;
  }
  // Locked against a concurrent edit of the contribution (the Zero mutator
  // locks it too), so its refund check and this status change both hold.
  const [target] = await tx
    .select({
      amountPaise: contribution.amountPaise,
      id: contribution.id,
      status: contribution.status,
    })
    .from(contribution)
    .where(eq(contribution.id, payment.contributionId))
    .for("update");
  if (!target) {
    return NOT_IMPORTED;
  }

  const [known] = await tx
    .select({
      contributionId: externalIdentity.contributionId,
      payloadHash: externalIdentity.payloadHash,
    })
    .from(externalIdentity)
    .where(identityWhere(refund.mode, "refund", refund.refundId))
    .limit(1);
  const [stored] = known
    ? await tx
        .select({ amountChanged: contributionRefund.amountChanged })
        .from(contributionRefund)
        .where(storedRefundWhere(known.contributionId, refund.refundId))
        .limit(1)
    : [];
  const [before] = await tx
    .select({
      n: sql<string>`coalesce(sum(${contributionRefund.amountPaise}), 0)`,
    })
    .from(contributionRefund)
    .where(eq(contributionRefund.contributionId, target.id));
  const plan = planRefund({
    contribution: { amountPaise: target.amountPaise, status: target.status },
    known: known
      ? {
          amountChanged: stored?.amountChanged ?? false,
          payloadHash: known.payloadHash,
        }
      : null,
    refund: {
      amountPaise: refund.amountPaise,
      payloadHash: refund.payloadHash,
    },
    refundedBeforePaise: Number(before?.n ?? 0),
  });

  if (known) {
    await forgetPending(tx, refund.mode, refund.refundId);
    if (plan.action === "flag_changed") {
      // Only this flag is set; "after receipt" stays as it was.
      await tx
        .update(contributionRefund)
        .set({ amountChanged: true })
        .where(storedRefundWhere(known.contributionId, refund.refundId));
      return {
        contributionId: known.contributionId,
        result: "amount_changed",
        statusChanged: false,
      };
    }
    return {
      contributionId: known.contributionId,
      result: "already_applied",
      statusChanged: false,
    };
  }
  if (plan.action !== "record") {
    throw new Error("A new refund must be recorded");
  }

  await tx.insert(externalIdentity).values({
    contributionId: target.id,
    createdAt: now,
    entityType: "refund",
    externalId: refund.refundId,
    id: uuidv7(),
    payloadHash: refund.payloadHash,
    provider: "razorpay",
    providerAccount: refund.mode,
  });
  await tx.insert(contributionRefund).values({
    amountPaise: refund.amountPaise,
    contributionId: target.id,
    createdAt: now,
    id: uuidv7(),
    reference: refund.refundId,
    refundAfterReceipt: plan.refundAfterReceipt,
    refundedOn: refund.refundedOn,
    source: "razorpay",
  });
  if (plan.status) {
    await tx
      .update(contribution)
      .set({ status: plan.status, updatedAt: now })
      .where(eq(contribution.id, target.id));
  }
  await forgetPending(tx, refund.mode, refund.refundId);
  return {
    contributionId: target.id,
    result: "applied",
    statusChanged: plan.status !== null,
  };
}

async function holdIn(
  tx: Pick<ImportTx, "insert">,
  refund: RefundToApply,
  now: Date
): Promise<void> {
  await tx
    .insert(pendingRefund)
    .values({
      amountPaise: refund.amountPaise,
      createdAt: now,
      currency: refund.currency,
      id: uuidv7(),
      payloadHash: refund.payloadHash,
      paymentId: refund.paymentId,
      provider: "razorpay",
      providerAccount: refund.mode,
      refundedAt: refund.refundedAt,
      refundId: refund.refundId,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

/**
 * Keeps a verified refund copy (the webhook's) until it is recorded, so it
 * survives a job that never runs. A refund already held keeps its first
 * copy; recording it removes it.
 */
export async function holdRazorpayRefund(
  refund: RefundToApply,
  now: Date = new Date()
): Promise<void> {
  await holdIn(db, refund, now);
}

/**
 * Holds the refund's copy and applies it in one transaction under the
 * import run lock: recorded at once when its payment is a contribution,
 * otherwise left in `private.pending_refund` for the payment's import.
 */
export async function applyRazorpayRefund(
  refund: RefundToApply,
  now: Date = new Date()
): Promise<RefundApplyOutcome> {
  return await withImportTransaction(async (tx) => {
    await holdIn(tx, refund, now);
    return await applyIn(tx, refund, now);
  });
}

/**
 * Applies the refunds held for a payment, inside the import transaction
 * that has just created or linked its contribution. `dayOf` gives a
 * refund's India date. Returns how many were recorded.
 */
export async function applyPendingRefunds(
  tx: ImportTx,
  mode: string,
  paymentId: string,
  dayOf: (at: Date) => string,
  now: Date = new Date()
): Promise<number> {
  const held = await tx
    .select()
    .from(pendingRefund)
    .where(
      and(
        eq(pendingRefund.provider, "razorpay"),
        eq(pendingRefund.providerAccount, mode),
        eq(pendingRefund.paymentId, paymentId)
      )
    )
    .orderBy(pendingRefund.refundedAt);
  let applied = 0;
  for (const row of held) {
    const outcome = await applyIn(
      tx,
      {
        amountPaise: row.amountPaise,
        currency: row.currency,
        mode,
        payloadHash: row.payloadHash,
        paymentId,
        refundedAt: row.refundedAt,
        refundedOn: dayOf(row.refundedAt),
        refundId: row.refundId,
      },
      now
    );
    if (outcome.result === "applied") {
      applied += 1;
    }
  }
  return applied;
}

/** Refunds the founder should look at, for the settings page. */
export async function countRefundsNeedingAttention(): Promise<{
  afterReceipt: number;
  amountChanged: number;
}> {
  const [row] = await db
    .select({
      afterReceipt: sql<number>`(count(*) filter (where ${contributionRefund.refundAfterReceipt}))::int`,
      amountChanged: sql<number>`(count(*) filter (where ${contributionRefund.amountChanged}))::int`,
    })
    .from(contributionRefund);
  return {
    afterReceipt: Number(row?.afterReceipt ?? 0),
    amountChanged: Number(row?.amountChanged ?? 0),
  };
}

/** Refunds held until their payment is imported, for the settings page. */
export async function countPendingRefunds(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(pendingRefund);
  return Number(row?.n ?? 0);
}
