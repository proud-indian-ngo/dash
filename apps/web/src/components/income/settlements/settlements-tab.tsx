import {
  Alert02Icon,
  BankIcon,
  Coins01Icon,
  Invoice03Icon,
  MoneyExchange03Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
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
  "Razorpay gifts in pi-dash that no processed settlement has paid out yet (each gift less Razorpay's fee and GST), less their refunds that no processed settlement has taken back yet. A gift recorded by hand and linked to a Razorpay payment has no fee recorded, so it counts in full until settled.";

export const GIVE_DO_AWAITING_SETTLEMENT_HINT =
  "give.do gifts in pi-dash that no processed payout has paid out yet, each gift less give.do's recorded charge.";

/** Changes whenever a settlement is added or its amount or status changes. */
const settlementsSignature = (rows: readonly SettlementRow[]) =>
  rows
    .map((row) => `${row.id}:${row.status}:${row.amountPaise}:${row.updatedAt}`)
    .join("|");

/**
 * The figures above the table. The clearing balance needs server-only
 * identities, so it comes from a server function, fetched again when the
 * settlements change or on Retry. `failed` is set when the last load
 * failed; figures loaded before stay.
 */
function useSettlementSummary(refreshKey: string) {
  const load = useServerFn(getSettlementSummary);
  const [state, setState] = useState<SettlementSummaryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setState(result);
          setFailed(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed(true);
        }
        log.error({
          action: "income.settlementSummary",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "SettlementsTab",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, load, attempt]);
  const retry = useEventCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  });
  return { failed, retry, summary: state };
}

/**
 * Income → Settlements (finance.view or finance.manage): gateway payouts
 * from the clearing balances to the bank, with what each provider still
 * owes.
 */
export function SettlementsTab() {
  // The server's mode decides which settlements show, as for the figures.
  const [mode, setMode] = useState<"live" | "test" | null>(null);
  const [settlements, result] = useQuery(
    queries.gatewaySettlement.list({ providerAccount: mode ?? "" })
  );
  const rows = settlements as SettlementRow[];
  const { failed, retry, summary } = useSettlementSummary(
    settlementsSignature(rows)
  );
  useEffect(() => {
    if (summary) {
      setMode(summary.mode);
    }
  }, [summary]);
  const isLoading =
    (summary === null && !failed) ||
    (rows.length === 0 && result.type !== "complete");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useEventCallback((row: SettlementRow) => setOpenId(row.id));

  const items: StatItem[] = [
    {
      hint: AWAITING_SETTLEMENT_HINT,
      icon: MoneyExchange03Icon,
      label: "Awaiting from Razorpay",
      value:
        summary === null || summary.awaitingPaise === null
          ? "—"
          : formatPaise(summary.awaitingPaise),
    },
    {
      hint: GIVE_DO_AWAITING_SETTLEMENT_HINT,
      icon: MoneyExchange03Icon,
      label: "Awaiting from give.do",
      value: summary ? formatPaise(summary.giveDoAwaitingPaise) : "—",
    },
    {
      icon: BankIcon,
      label: `Settled ${summary?.financialYear ?? "this year"}`,
      value: summary
        ? formatPaise(
            summary.settledThisYearPaise + summary.giveDoSettledThisYearPaise
          )
        : "—",
    },
    {
      icon: Invoice03Icon,
      label: `Fees ${summary?.financialYear ?? "this year"}`,
      value: summary
        ? formatPaise(
            summary.feesThisYearPaise + summary.giveDoFeesThisYearPaise
          )
        : "—",
    },
  ];

  if (summary === null && failed) {
    return (
      <NotFoundState
        actions={
          <Button onClick={retry} type="button" variant="outline">
            <HugeiconsIcon
              className="size-4"
              icon={RefreshIcon}
              strokeWidth={2}
            />
            Retry
          </Button>
        }
        description="Settlements and their figures couldn't be loaded."
        icon={Alert02Icon}
        title="Couldn't load settlements"
      />
    );
  }

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
              ? "No give.do payouts have been imported, and Razorpay is not configured on this server."
              : "Gateway payouts into the bank appear here after a give.do payout import or Razorpay sync."
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
