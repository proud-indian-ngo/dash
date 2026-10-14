import { and, eq } from "drizzle-orm";

import { db } from "..";
import { gatewaySettlement } from "../schema/gateway-settlement";
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
