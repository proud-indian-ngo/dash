import {
  BankIcon,
  Coins01Icon,
  Invoice03Icon,
  MoneyExchange03Icon,
} from "@hugeicons/core-free-icons";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { NotFoundState } from "@/components/shared/not-found-state";
import { StatsCards, type StatItem } from "@/components/stats/stats-cards";
import {
  getSettlementSummary,
  type SettlementSummaryResponse,
} from "@/functions/razorpay-settlements";

import { SettlementDetailSheet } from "./settlement-detail-sheet";
import type { SettlementRow } from "./settlement-types";
import { SettlementsTable } from "./settlements-table";

export const AWAITING_SETTLEMENT_HINT =
  "Imported Razorpay gifts' gross, less Razorpay's fees and GST on them, less their refunds, less what Razorpay has already paid out in processed settlements.";

/** Changes whenever a settlement is added or its amount or status changes. */
const settlementsSignature = (rows: readonly SettlementRow[]) =>
  rows
    .map((row) => `${row.id}:${row.status}:${row.amountPaise}:${row.updatedAt}`)
    .join("|");

/**
 * The figures above the table. The clearing balance needs server-only
 * identities, so it comes from a server function, fetched again when the
 * settlements change.
 */
function useSettlementSummary(refreshKey: string) {
  const load = useServerFn(getSettlementSummary);
  const [state, setState] = useState<SettlementSummaryResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "income.settlementSummary",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "SettlementsTab",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, load]);
  return state;
}

/**
 * Income → Settlements (finance.view or finance.manage): Razorpay payouts
 * from the clearing balance to the bank, with what is still awaiting
 * settlement.
 */
export function SettlementsTab() {
  const [settlements, result] = useQuery(queries.gatewaySettlement.list());
  const rows = settlements as SettlementRow[];
  const isLoading = rows.length === 0 && result.type !== "complete";
  const summary = useSettlementSummary(settlementsSignature(rows));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useEventCallback((row: SettlementRow) => setOpenId(row.id));

  const items: StatItem[] = [
    {
      hint: AWAITING_SETTLEMENT_HINT,
      icon: MoneyExchange03Icon,
      label: "Awaiting settlement",
      value:
        summary?.awaitingPaise === null || summary === null
          ? "—"
          : formatPaise(summary.awaitingPaise),
    },
    {
      icon: BankIcon,
      label: `Settled ${summary?.financialYear ?? "this year"}`,
      value: summary ? formatPaise(summary.settledThisYearPaise) : "—",
    },
    {
      icon: Invoice03Icon,
      label: `Fees ${summary?.financialYear ?? "this year"}`,
      value: summary ? formatPaise(summary.feesThisYearPaise) : "—",
    },
  ];

  if (!isLoading && rows.length === 0) {
    return (
      <>
        <StatsCards items={items} />
        <NotFoundState
          description="Payouts Razorpay makes from donations into the bank appear here once a sync has listed them. They need RAZORPAY_KEY_SECRET on the server."
          icon={Coins01Icon}
          title="No settlements yet"
        />
      </>
    );
  }

  return (
    <>
      <StatsCards isLoading={isLoading} items={items} />
      <SettlementsTable data={rows} isLoading={isLoading} onOpen={open} />
      <SettlementDetailSheet
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpenId(null);
          }
        }}
        settlementId={openId}
      />
    </>
  );
}
