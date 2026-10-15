import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { RECEIPT_COLUMN_LABELS } from "@pi-dash/shared/receipts";

import { StatusBadge } from "@/components/shared/status-badge";

import type { ContributionRow } from "../income-types";
import {
  contributionReceiptValue,
  type ReceiptReadinessSets,
} from "./receipt-column";
import { liveReceipt, receiptPdfUrl } from "./receipt-types";

const stopPropagation = (event: { stopPropagation: () => void }) =>
  event.stopPropagation();

/**
 * The Income table's Receipt cell: the receipt number (a download link for
 * issuers, as on the contribution sheet), who receipts a gateway gift, or
 * whether a direct gift is ready, needs details or needs no receipt.
 */
export function ContributionReceiptCell({
  canDownload,
  readiness,
  row,
}: {
  canDownload: boolean;
  readiness: ReceiptReadinessSets | null;
  row: ContributionRow;
}) {
  const value = contributionReceiptValue(row, readiness);
  if (value === null) {
    // Waiting for the server's split; a gift it doesn't list shows a dash.
    return readiness === null ? (
      <Skeleton className="h-5 w-20" />
    ) : (
      <span
        className="text-muted-foreground"
        data-testid="contribution-receipt-cell"
      >
        {RECEIPT_COLUMN_LABELS.none}
      </span>
    );
  }
  if (value === "issued") {
    const live = liveReceipt(row.receipts);
    const number = live?.number ?? RECEIPT_COLUMN_LABELS.issued;
    return live && canDownload ? (
      <a
        className="font-mono text-sm underline underline-offset-2"
        data-testid="contribution-receipt-cell"
        download
        href={receiptPdfUrl(live.id)}
        onClick={stopPropagation}
        title={`Download receipt ${number}`}
      >
        {number}
      </a>
    ) : (
      <span
        className="font-mono text-sm"
        data-testid="contribution-receipt-cell"
      >
        {number}
      </span>
    );
  }
  if (value === "ready" || value === "needs_details") {
    return (
      <StatusBadge
        data-testid="contribution-receipt-cell"
        tone={value === "ready" ? "info" : "warning"}
      >
        {RECEIPT_COLUMN_LABELS[value]}
      </StatusBadge>
    );
  }
  return (
    <span
      className="text-muted-foreground text-sm"
      data-testid="contribution-receipt-cell"
    >
      {RECEIPT_COLUMN_LABELS[value]}
    </span>
  );
}
