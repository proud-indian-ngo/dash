import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import type { ContributionStatus } from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_STATUS_LABELS,
  type NetReceivedInput,
  refundSummary,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

const STATUS_TONE: Record<ContributionStatus, StatusTone> = {
  pending: "warning",
  receipted: "info",
  received: "success",
  refunded: "danger",
  reversed: "neutral",
};

/** "₹100.00 of ₹1,000.00 refunded". */
export function refundedOfLabel(
  refundedPaise: number,
  amountPaise: number
): string {
  return `${formatPaise(refundedPaise)} of ${formatPaise(amountPaise)} refunded`;
}

/**
 * One badge per contribution. While some, not all, of it has been refunded
 * it reads "Partly refunded" (derived from its refunds, never stored);
 * otherwise its status. When anything was refunded, the amount is in a
 * tooltip on the badge, so the cell stays one line.
 */
export function ContributionStatusBadge({
  refund,
  status,
}: {
  /** The contribution with its refunds, to show what was refunded. */
  refund?: NetReceivedInput;
  status: string | null;
}) {
  const value = (status ?? "received") as ContributionStatus;
  const summary = refund ? refundSummary(refund) : null;
  const badge = summary?.partly ? (
    <StatusBadge data-testid="contribution-status" tone="warning">
      Partly refunded
    </StatusBadge>
  ) : (
    <StatusBadge
      data-testid="contribution-status"
      tone={STATUS_TONE[value] ?? "neutral"}
    >
      {CONTRIBUTION_STATUS_LABELS[value] ?? value}
    </StatusBadge>
  );
  if (!(summary && refund)) {
    return badge;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={badge} />
      <TooltipContent>
        {refundedOfLabel(summary.refundedPaise, refund.amountPaise)}
      </TooltipContent>
    </Tooltip>
  );
}
