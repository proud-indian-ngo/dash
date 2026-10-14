import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  GatewaySettlementItemType,
  GatewaySettlementStatus,
} from "@pi-dash/shared/constants";
import { formatPaise } from "@pi-dash/shared/money";
import {
  expectedNetPaise,
  hasFeeMismatch,
  isUnlinkedLine,
  lineAmountPaise,
  settlementBreakdown,
  settlementOwnFeePaise,
} from "@pi-dash/shared/settlements";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { formatReceivedOn } from "@/components/income/contribution-detail-sheet";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { DetailsRow } from "@/components/shared/record-detail";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { DATE } from "@/lib/date-formats";

import {
  SETTLEMENT_LINE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_TONES,
  type SettlementDetail,
  type SettlementLineRow,
} from "./settlement-types";

function Warning({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 mx-6 mb-4 flex items-start gap-2 rounded-md border p-3 text-sm"
      data-testid={testId}
      role="status"
    >
      <HugeiconsIcon
        className="mt-0.5 size-4 shrink-0"
        icon={Alert02Icon}
        strokeWidth={2}
      />
      <span>{children}</span>
    </div>
  );
}

/** One line of the breakdown: a label, and a signed amount on the right. */
function BreakdownRow({
  label,
  paise,
  sign,
  strong = false,
}: {
  label: string;
  paise: number;
  sign: "+" | "−" | "=" | "±";
  strong?: boolean;
}) {
  const shown =
    sign === "±"
      ? `${paise < 0 ? "−" : "+"} ${formatPaise(Math.abs(paise))}`
      : `${sign === "+" ? "" : `${sign} `}${formatPaise(paise)}`;
  return (
    <div
      className={
        strong
          ? "flex items-center justify-between gap-3 border-t pt-2 text-sm font-semibold"
          : "flex items-center justify-between gap-3 text-sm"
      }
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="font-mono tabular-nums">{shown}</dd>
    </div>
  );
}

function lineParty(line: SettlementLineRow): ReactNode {
  if (line.type === "payment") {
    return line.contribution ? (
      (line.contribution.party?.displayName ?? "Unknown donor")
    ) : (
      <span className="text-muted-foreground">Not imported yet</span>
    );
  }
  if (line.type === "refund" && isUnlinkedLine(line)) {
    return <span className="text-muted-foreground">Not recorded yet</span>;
  }
  return null;
}

function Lines({ lines }: { lines: readonly SettlementLineRow[] }) {
  return (
    <section
      aria-label="Settled lines"
      className="flex flex-col gap-2 px-6 pb-6"
    >
      <h3 className="text-sm font-medium">What it covered</h3>
      <ul className="divide-y rounded-lg border" data-testid="settlement-lines">
        {lines.map((line) => {
          const party = lineParty(line);
          const fee = (line.feePaise ?? 0) + (line.taxPaise ?? 0);
          return (
            <li
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              key={line.id}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">
                  {SETTLEMENT_LINE_LABELS[
                    line.type as GatewaySettlementItemType
                  ] ?? line.type}
                  {party ? <> · {party}</> : null}
                </span>
                <span className="text-muted-foreground truncate font-mono text-xs">
                  {format(new Date(line.settledAt), DATE)} · {line.externalId}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-mono tabular-nums">
                  {formatPaise(lineAmountPaise(line))}
                </span>
                {fee > 0 ? (
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    Fee {formatPaise(fee)}
                  </span>
                ) : null}
                {hasFeeMismatch(line, line.contribution) ? (
                  <Tag title="Razorpay's fee here differs from the fee recorded on the contribution">
                    Fee differs
                  </Tag>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SettlementBody({ settlement }: { settlement: SettlementDetail }) {
  const lines = settlement.items ?? [];
  const breakdown = settlementBreakdown(lines);
  const unlinked = lines.filter((line) => isUnlinkedLine(line)).length;
  const feeMismatches = lines.filter((line) =>
    hasFeeMismatch(line, line.contribution)
  ).length;
  const ownFee = settlementOwnFeePaise(settlement);
  const expected = expectedNetPaise(breakdown, settlement);
  const addsUp = expected === settlement.amountPaise;
  const unreadable = settlement.unreadableLineCount ?? 0;

  return (
    <>
      {lines.length === 0 ? (
        <Warning testId="settlement-no-lines">
          Razorpay hasn't listed what this payout covered yet; the next sync
          fetches it.
        </Warning>
      ) : addsUp ? null : (
        <Warning testId="settlement-mismatch">
          The lines add up to {formatPaise(expected)}, but Razorpay paid{" "}
          {formatPaise(settlement.amountPaise)}.
          {unreadable > 0
            ? " Some of its lines could not be read; see below."
            : ""}
        </Warning>
      )}
      {unreadable > 0 ? (
        <Warning testId="settlement-unreadable">
          {unreadable === 1
            ? "1 line"
            : `${unreadable.toLocaleString("en-IN")} lines`}{" "}
          not readable: Razorpay listed {unreadable === 1 ? "a line" : "lines"}{" "}
          for this settlement in another currency or a shape pi-dash doesn't
          read, so {unreadable === 1 ? "it isn't" : "they aren't"} counted here.
        </Warning>
      ) : null}
      {settlement.amountChanged ? (
        <Warning testId="settlement-amount-changed">
          Razorpay later reported this settlement with a different amount; the
          first amount is kept.
        </Warning>
      ) : null}
      {unlinked > 0 ? (
        <Warning testId="settlement-unlinked">
          {unlinked === 1
            ? "1 payment or refund isn't recorded in pi-dash yet;"
            : `${unlinked.toLocaleString("en-IN")} payments or refunds aren't recorded in pi-dash yet;`}{" "}
          each is linked when it is imported.
        </Warning>
      ) : null}
      {feeMismatches > 0 ? (
        <Warning testId="settlement-fee-mismatch">
          Razorpay's fee differs from the contribution's recorded fee on{" "}
          {feeMismatches === 1
            ? "1 payment"
            : `${feeMismatches.toLocaleString("en-IN")} payments`}
          . The contributions are left as they are.
        </Warning>
      ) : null}
      <dl
        className="mx-6 mb-5 flex flex-col gap-1.5 rounded-lg border p-3"
        data-testid="settlement-breakdown"
      >
        <BreakdownRow
          label={`Payments (${breakdown.paymentCount.toLocaleString("en-IN")})`}
          paise={breakdown.grossPaise}
          sign="+"
        />
        <BreakdownRow label="Fees" paise={breakdown.feesPaise} sign="−" />
        <BreakdownRow label="GST on fees" paise={breakdown.taxPaise} sign="−" />
        {breakdown.refundsPaise === 0 ? null : (
          <BreakdownRow
            label={`Refunds (${breakdown.refundCount.toLocaleString("en-IN")})`}
            paise={breakdown.refundsPaise}
            sign="−"
          />
        )}
        {breakdown.transfersPaise === 0 ? null : (
          <BreakdownRow
            label="Transfers"
            paise={breakdown.transfersPaise}
            sign="−"
          />
        )}
        {breakdown.adjustmentsPaise === 0 ? null : (
          <BreakdownRow
            label="Adjustments"
            paise={breakdown.adjustmentsPaise}
            sign="±"
          />
        )}
        {ownFee === 0 ? null : (
          <BreakdownRow
            label="Instant settlement fee"
            paise={ownFee}
            sign="−"
          />
        )}
        <BreakdownRow
          label="Net paid"
          paise={settlement.amountPaise}
          sign="="
          strong
        />
      </dl>
      <dl className="flex flex-col gap-2.5 px-6 pb-6">
        <DetailsRow label="Settlement ID">
          <span className="font-mono text-xs">{settlement.externalId}</span>
        </DetailsRow>
        <DetailsRow label="UTR">
          <span className="font-mono text-xs">{settlement.utr ?? "—"}</span>
        </DetailsRow>
        <DetailsRow label="Mode">
          {settlement.providerAccount === "test" ? "Test" : "Live"}
        </DetailsRow>
      </dl>
      {lines.length > 0 ? <Lines lines={lines} /> : null}
    </>
  );
}

/**
 * A settlement's sheet: what Razorpay paid into the bank and how it adds up
 * (gross − fees − GST − refunds ± adjustments − instant settlement fee =
 * net paid), with every line
 * it covered. Read-only; Razorpay documents no dashboard link for a
 * settlement, so there is none.
 */
export function SettlementDetailSheet({
  onOpenChange,
  settlementId,
}: {
  onOpenChange: (open: boolean) => void;
  settlementId: string | null;
}) {
  const [settlement] = useQuery(
    queries.gatewaySettlement.byId({ id: settlementId ?? "" }),
    { enabled: settlementId !== null }
  );
  const row = settlementId
    ? (settlement as SettlementDetail | undefined)
    : undefined;
  if (!row) {
    return (
      <Sheet onOpenChange={onOpenChange} open={false}>
        <SheetContent />
      </Sheet>
    );
  }
  const status = row.status as GatewaySettlementStatus;
  return (
    <Sheet onOpenChange={onOpenChange} open>
      <SheetContent>
        <DetailSheetHeader
          badge={
            <StatusBadge tone={SETTLEMENT_STATUS_TONES[status] ?? "neutral"}>
              {SETTLEMENT_STATUS_LABELS[status] ?? status}
            </StatusBadge>
          }
          meta={[`Settled on ${formatReceivedOn(row.settledOn)}`, row.utr]}
          title={formatPaise(row.amountPaise)}
        />
        <SettlementBody settlement={row} />
      </SheetContent>
    </Sheet>
  );
}
