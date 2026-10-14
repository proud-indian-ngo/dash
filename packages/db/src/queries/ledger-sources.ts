import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "..";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "../schema/gateway-settlement";
import { contributionRefund } from "../schema/income";
import { ledgerSourceState } from "../schema/ledger";
import { externalIdentity } from "../schema/private/imports";

/**
 * Server only. The income records a Razorpay sync touched, by the
 * provider's IDs, so the sync job can queue their posting (finance layer
 * 3-2) after it commits.
 */

export async function contributionIdsForRazorpayPayment(
  paymentId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: externalIdentity.contributionId })
    .from(externalIdentity)
    .where(
      and(
        eq(externalIdentity.provider, "razorpay"),
        eq(externalIdentity.entityType, "payment"),
        eq(externalIdentity.externalId, paymentId)
      )
    );
  return rows.map((r) => r.id);
}

export async function refundIdsForRazorpayRefund(
  refundId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: contributionRefund.id })
    .from(contributionRefund)
    .where(
      and(
        eq(contributionRefund.source, "razorpay"),
        eq(contributionRefund.reference, refundId)
      )
    );
  return rows.map((r) => r.id);
}

export async function settlementIdsForRazorpaySettlement(
  settlementId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: gatewaySettlement.id })
    .from(gatewaySettlement)
    .where(
      and(
        eq(gatewaySettlement.provider, "razorpay"),
        eq(gatewaySettlement.externalId, settlementId)
      )
    );
  return rows.map((r) => r.id);
}

/** Records waiting to post, for the "Post pending" audit entry (a count only). */
export async function countWaitingLedgerSources(): Promise<number> {
  return await db.$count(
    ledgerSourceState,
    eq(ledgerSourceState.status, "waiting")
  );
}

/**
 * Processed payouts with a line linked to these gifts or refunds: a sync
 * that links a line changes what the payout posts (its charges, the lines
 * that need a look), so the payout posts again.
 */
export async function settlementIdsLinkedTo(links: {
  contributionIds?: readonly string[];
  refundIds?: readonly string[];
}): Promise<string[]> {
  const contributionIds = [...(links.contributionIds ?? [])];
  const refundIds = [...(links.refundIds ?? [])];
  if (contributionIds.length + refundIds.length === 0) {
    return [];
  }
  const rows = await db
    .selectDistinct({ id: gatewaySettlementItem.settlementId })
    .from(gatewaySettlementItem)
    .innerJoin(
      gatewaySettlement,
      eq(gatewaySettlement.id, gatewaySettlementItem.settlementId)
    )
    .where(
      and(
        eq(gatewaySettlement.status, "processed"),
        or(
          contributionIds.length > 0
            ? inArray(gatewaySettlementItem.contributionId, contributionIds)
            : undefined,
          refundIds.length > 0
            ? inArray(gatewaySettlementItem.contributionRefundId, refundIds)
            : undefined
        )
      )
    );
  return rows.map((r) => r.id);
}
