import { queries } from "@pi-dash/zero/queries";
import type { GatewaySettlement } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { useApp } from "@/context/app-context";
import { getContributionSettlementLock } from "@/functions/razorpay-settlements";

/**
 * Where a gateway gift stands with its payout: paid out by a processed
 * settlement (the newest, if more than one), waiting in a settlement that
 * is not processed yet, or not in any (a failed settlement counts as none).
 */
export type ContributionSettlement =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "pending"; settlement: GatewaySettlement }
  | { kind: "settled"; settlement: GatewaySettlement };

export function isGatewayContribution(contribution: {
  channel: string;
}): boolean {
  return (
    contribution.channel === "razorpay" || contribution.channel === "give_do"
  );
}

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

/**
 * Whether a gateway gift's reported fields are fixed and Delete hidden
 * because a processed settlement paid it out, matching the Zero mutator.
 * Finance holders read it from the synced settlement; others ask the
 * server. While unknown (`checking`: loading, or the check failed) the
 * form and sheet treat it as locked, so they never offer an edit the
 * server would refuse.
 */
export type SettlementLock = "checking" | "locked" | "unlocked";

export function useSettlementLock(
  contributionId: string | null,
  isGatewayGift: boolean
): SettlementLock {
  const { hasPermission } = useApp();
  const seesSettlements =
    hasPermission("finance.view") || hasPermission("finance.manage");
  const active = isGatewayGift && contributionId !== null;
  const synced = useContributionSettlement(
    contributionId,
    active && seesSettlements
  );
  const check = useServerFn(getContributionSettlementLock);
  const [fromServer, setFromServer] = useState<{
    id: string;
    locked: boolean;
  } | null>(null);
  useEffect(() => {
    if (!(active && !seesSettlements && contributionId)) {
      return;
    }
    let cancelled = false;
    check({ data: { contributionId } })
      .then(({ locked }) => {
        if (!cancelled) {
          setFromServer({ id: contributionId, locked });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "income.settlementLock",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useSettlementLocked",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [active, seesSettlements, contributionId, check]);
  if (!active) {
    return "unlocked";
  }
  if (seesSettlements) {
    if (synced.kind === "loading") {
      return "checking";
    }
    return synced.kind === "settled" ? "locked" : "unlocked";
  }
  if (fromServer?.id !== contributionId) {
    return "checking";
  }
  return fromServer.locked ? "locked" : "unlocked";
}
