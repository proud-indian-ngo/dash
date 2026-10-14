import type { ContributionRefundAttention } from "@pi-dash/shared/constants";
import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { planRefund } from "../refund-rules";
import { contribution, contributionRefund } from "../schema/income";
import { externalIdentity } from "../schema/private/imports";

/**
 * Database side of Razorpay refunds. A processed refund is recorded once
 * against the contribution its payment became: its refund ID is an external
 * identity (entity type `refund`), so applying it again is a no-op, and a
 * later copy with a different amount is flagged, never written over. The
 * contribution's status moves to `refunded` once its refunds cover it,
 * unless it is receipted (flagged, never changed) or reversed (recorded
 * only). No posting and no movement is made.
 */

export type RefundApplyResult =
  /** Recorded now. */
  | "applied"
  /** Recorded before with the same amount. */
  | "already_applied"
  /** Recorded before with a different amount: flagged, not changed. */
  | "amount_changed"
  /** The payment is not a contribution yet; the refund waits for it. */
  | "payment_not_imported";

export interface RefundApplyOutcome {
  /** Set when the founder should look at the refund. */
  attention: ContributionRefundAttention | null;
  contributionId: string | null;
  result: RefundApplyResult;
  /** True when this refund moved the contribution to `refunded`. */
  statusChanged: boolean;
}

export interface RefundToApply {
  amountPaise: number;
  /** Live or test: the provider account of both identities. */
  mode: string;
  paymentId: string;
  /** Fingerprint of the refund's amount and payment; a change is flagged. */
  payloadHash: string;
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

export async function applyRazorpayRefund(
  refund: RefundToApply,
  now: Date = new Date()
): Promise<RefundApplyOutcome> {
  return await db.transaction(async (tx) => {
    const [payment] = await tx
      .select({ contributionId: externalIdentity.contributionId })
      .from(externalIdentity)
      .where(identityWhere(refund.mode, "payment", refund.paymentId))
      .limit(1);
    if (!payment) {
      return {
        attention: null,
        contributionId: null,
        result: "payment_not_imported",
        statusChanged: false,
      };
    }
    // Refunds of one contribution apply one at a time, so the total each
    // sees includes the others.
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
      return {
        attention: null,
        contributionId: null,
        result: "payment_not_imported",
        statusChanged: false,
      };
    }

    const [known] = await tx
      .select({
        contributionId: externalIdentity.contributionId,
        payloadHash: externalIdentity.payloadHash,
      })
      .from(externalIdentity)
      .where(identityWhere(refund.mode, "refund", refund.refundId))
      .limit(1);
    const [before] = await tx
      .select({
        n: sql<string>`coalesce(sum(${contributionRefund.amountPaise}), 0)`,
      })
      .from(contributionRefund)
      .where(eq(contributionRefund.contributionId, target.id));
    const plan = planRefund({
      contribution: { amountPaise: target.amountPaise, status: target.status },
      knownPayloadHash: known?.payloadHash ?? null,
      refund: {
        amountPaise: refund.amountPaise,
        payloadHash: refund.payloadHash,
      },
      refundedBeforePaise: Number(before?.n ?? 0),
    });
    if (known && plan.action === "already_applied") {
      return {
        attention: null,
        contributionId: known.contributionId,
        result: "already_applied",
        statusChanged: false,
      };
    }
    if (known) {
      await tx
        .update(contributionRefund)
        .set({ attention: "amount_changed" })
        .where(
          and(
            eq(contributionRefund.contributionId, known.contributionId),
            eq(contributionRefund.reference, refund.refundId)
          )
        );
      return {
        attention: "amount_changed",
        contributionId: known.contributionId,
        result: "amount_changed",
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
    const { attention } = plan;
    await tx.insert(contributionRefund).values({
      amountPaise: refund.amountPaise,
      attention,
      contributionId: target.id,
      createdAt: now,
      id: uuidv7(),
      reference: refund.refundId,
      refundedOn: refund.refundedOn,
      source: "razorpay",
    });
    const statusChanged = plan.status !== null;
    if (plan.status) {
      await tx
        .update(contribution)
        .set({ status: plan.status, updatedAt: now })
        .where(eq(contribution.id, target.id));
    }
    return {
      attention,
      contributionId: target.id,
      result: "applied",
      statusChanged,
    };
  });
}

/** Refunds that need the founder's look, by reason, for the settings page. */
export async function countRefundsNeedingAttention(): Promise<
  Map<ContributionRefundAttention, number>
> {
  const rows = await db
    .select({ attention: contributionRefund.attention, n: count() })
    .from(contributionRefund)
    .where(isNotNull(contributionRefund.attention))
    .groupBy(contributionRefund.attention);
  return new Map(
    rows.flatMap((row) =>
      row.attention ? [[row.attention, Number(row.n)] as const] : []
    )
  );
}
