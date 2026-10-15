import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import {
  RECEIPT_COLUMN_LABELS,
  receiptBlocksTitle,
} from "@pi-dash/shared/receipts";

import { StatusBadge } from "@/components/shared/status-badge";

import type { ContributionRow } from "../income-types";
import { contributionReceiptValue } from "./receipt-column";
import { liveReceipt, receiptPdfUrl } from "./receipt-types";
import type { ReceiptReadinessState } from "./use-receipt-readiness";

const stopPropagation = (event: { stopPropagation: () => void }) =>
  event.stopPropagation();

const TEST_ID = "contribution-receipt-cell";

/**
 * The Income table's Receipt cell: the receipt number (a download link for
 * issuers, as on the contribution sheet), who receipts a gateway gift, or
 * whether a direct gift is ready, needs details, can't be issued (with why
 * in a tooltip) or needs no receipt.
 */
export function ContributionReceiptCell({
  canDownload,
  readiness: state,
  row,
}: {
  canDownload: boolean;
  readiness: ReceiptReadinessState;
  row: ContributionRow;
}) {
  const { readiness } = state;
  const value = contributionReceiptValue(row, readiness);
  if (value === null) {
    if (state.error || state.gaveUp) {
      return (
        <button
          className="text-muted-foreground text-sm underline-offset-2 hover:underline"
          data-testid={TEST_ID}
          onClick={(event) => {
            event.stopPropagation();
            state.retry();
          }}
          title="Receipt status couldn't be loaded. Retry"
          type="button"
        >
          Unavailable · Retry
        </button>
      );
    }
    // Waiting for the server's split.
    return <Skeleton className="h-5 w-20" />;
  }
  if (value === "issued") {
    const live = liveReceipt(row.receipts);
    const number = live?.number ?? RECEIPT_COLUMN_LABELS.issued;
    return live && canDownload ? (
      <a
        className="font-mono text-sm underline underline-offset-2"
        data-testid={TEST_ID}
        download
        href={receiptPdfUrl(live.id)}
        onClick={stopPropagation}
        title={`Download receipt ${number}`}
      >
        {number}
      </a>
    ) : (
      <span className="font-mono text-sm" data-testid={TEST_ID}>
        {number}
      </span>
    );
  }
  if (value === "cant_issue") {
    const reasons = receiptBlocksTitle(readiness?.cantIssue.get(row.id) ?? []);
    const badge = (
      <StatusBadge data-testid={TEST_ID} title={reasons} tone="danger">
        {RECEIPT_COLUMN_LABELS.cant_issue}
      </StatusBadge>
    );
    return reasons ? (
      <Tooltip>
        <TooltipTrigger render={badge} />
        <TooltipContent>{reasons}</TooltipContent>
      </Tooltip>
    ) : (
      badge
    );
  }
  if (value === "ready" || value === "needs_details") {
    return (
      <StatusBadge
        data-testid={TEST_ID}
        tone={value === "ready" ? "info" : "warning"}
      >
        {RECEIPT_COLUMN_LABELS[value]}
      </StatusBadge>
    );
  }
  return (
    <span className="text-muted-foreground text-sm" data-testid={TEST_ID}>
      {RECEIPT_COLUMN_LABELS[value]}
    </span>
  );
}
