import type { ContributionStatus } from "@pi-dash/shared/constants";
import { CONTRIBUTION_STATUS_LABELS } from "@pi-dash/shared/income";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

const STATUS_TONE: Record<ContributionStatus, StatusTone> = {
  pending: "warning",
  receipted: "info",
  received: "success",
  refunded: "danger",
  reversed: "neutral",
};

export function ContributionStatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "received") as ContributionStatus;
  return (
    <StatusBadge tone={STATUS_TONE[value] ?? "neutral"}>
      {CONTRIBUTION_STATUS_LABELS[value] ?? value}
    </StatusBadge>
  );
}
