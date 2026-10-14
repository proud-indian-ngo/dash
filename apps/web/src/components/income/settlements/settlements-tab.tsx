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
import { Link } from "@tanstack/react-router";
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
  "Razorpay gifts in pi-dash that no processed settlement has paid out yet (each gift less Razorpay's fee and GST), less their refunds that no processed settlement has taken back yet.";

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
  // The server's mode decides which settlements show, as for the figures.
  const [mode, setMode] = useState<"live" | "test" | null>(null);
  const [settlements, result] = useQuery(
    queries.gatewaySettlement.list({ providerAccount: mode ?? "" }),
    { enabled: mode !== null }
  );
  const rows = mode ? (settlements as SettlementRow[]) : [];
  const summary = useSettlementSummary(settlementsSignature(rows));
  useEffect(() => {
    if (summary) {
      setMode(summary.mode);
    }
  }, [summary]);
  const isLoading =
    summary === null ||
    (mode !== null && rows.length === 0 && result.type !== "complete");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useEventCallback((row: SettlementRow) => setOpenId(row.id));

  const items: StatItem[] = [
    {
      hint: AWAITING_SETTLEMENT_HINT,
      icon: MoneyExchange03Icon,
      label: "Awaiting settlement",
      value:
        summary === null || summary.awaitingPaise === null
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

  const notImported = summary?.settledPaymentsNotImported ?? 0;
  const notImportedLine =
    notImported > 0 ? (
      <p
        className="text-muted-foreground text-sm"
        data-testid="settled-payments-not-imported"
      >
        {notImported === 1
          ? "1 settled payment isn't in pi-dash yet"
          : `${notImported.toLocaleString("en-IN")} settled payments aren't in pi-dash yet`}
        , so Awaiting settlement leaves {notImported === 1 ? "it" : "them"} out.
        Bring {notImported === 1 ? "it" : "them"} in with{" "}
        <Link
          className="text-foreground underline underline-offset-4"
          to="/settings/integrations"
        >
          Import past payments
        </Link>
        .
      </p>
    ) : null;

  if (!isLoading && rows.length === 0) {
    return (
      <>
        <StatsCards items={items} />
        {notImportedLine}
        <NotFoundState
          description={
            summary?.mode === null
              ? "Razorpay is not configured on this server."
              : "Payouts Razorpay makes from donations into the bank appear here once a sync has listed them. They need RAZORPAY_KEY_SECRET on the server."
          }
          icon={Coins01Icon}
          title="No settlements yet"
        />
      </>
    );
  }

  return (
    <>
      <StatsCards isLoading={isLoading} items={items} />
      {notImportedLine}
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
