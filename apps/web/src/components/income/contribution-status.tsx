import type { ContributionStatus } from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_STATUS_LABELS,
  type NetReceivedInput,
  refundNote,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";

import {
  StatusBadge,
  type StatusTone,
  Tag,
} from "@/components/shared/status-badge";

const STATUS_TONE: Record<ContributionStatus, StatusTone> = {
  pending: "warning",
  receipted: "info",
  received: "success",
  refunded: "danger",
  reversed: "neutral",
};

/**
 * The contribution's status, and, when some of it was refunded but the
 * status does not say so, "Partly refunded ₹X" beside it (derived from its
 * refunds, never stored).
 */
export function ContributionStatusBadge({
  refund,
  status,
}: {
  /** The contribution with its refunds, to show a partial refund. */
  refund?: NetReceivedInput;
  status: string | null;
}) {
  const value = (status ?? "received") as ContributionStatus;
  const note = refund ? refundNote(refund) : null;
  const badge = (
    <StatusBadge tone={STATUS_TONE[value] ?? "neutral"}>
      {CONTRIBUTION_STATUS_LABELS[value] ?? value}
    </StatusBadge>
  );
  if (!note) {
    return badge;
  }
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      {badge}
      <Tag data-testid="contribution-refund-note">
        {`${note.label} ${formatPaise(note.refundedPaise)}`}
      </Tag>
    </span>
  );
}
