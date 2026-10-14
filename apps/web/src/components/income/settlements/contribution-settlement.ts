import { queries } from "@pi-dash/zero/queries";
import type { GatewaySettlement } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";

/**
 * Where a Razorpay gift stands with its payout: paid out by a processed
 * settlement (the newest, if more than one), waiting in a settlement that
 * is not processed yet, or not in any (a failed settlement counts as none).
 */
export type ContributionSettlement =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "pending"; settlement: GatewaySettlement }
  | { kind: "settled"; settlement: GatewaySettlement };

export function contributionSettlementOf(
  lines: readonly { settlement?: GatewaySettlement | null }[]
): ContributionSettlement {
  const settlements = lines
    .map((line) => line.settlement)
    .filter((s): s is GatewaySettlement => Boolean(s));
  const newest = (status: string) =>
    settlements
      .filter((s) => s.status === status)
      .sort((a, b) => b.settledOn - a.settledOn)[0];
  const settled = newest("processed");
  if (settled) {
    return { kind: "settled", settlement: settled };
  }
  const pending = newest("created");
  return pending ? { kind: "pending", settlement: pending } : { kind: "none" };
}

/**
 * The settlement of one contribution's payment, for finance.view and
 * finance.manage holders (`enabled`); others never sync settlements.
 */
export function useContributionSettlement(
  contributionId: string | null,
  enabled: boolean
): ContributionSettlement {
  const [lines, result] = useQuery(
    queries.gatewaySettlement.byContribution({
      contributionId: contributionId ?? "",
    }),
    { enabled: enabled && contributionId !== null }
  );
  const state = contributionSettlementOf(
    lines as readonly { settlement?: GatewaySettlement | null }[]
  );
  if (state.kind === "none" && result.type !== "complete") {
    return { kind: "loading" };
  }
  return state;
}
