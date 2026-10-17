import {
  RESOLUTION_STATUS_LABELS,
  type ResolutionStatus,
} from "@pi-dash/shared/resolutions";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

const TONES: Record<ResolutionStatus, StatusTone> = {
  draft: "neutral",
  failed: "danger",
  issued: "info",
  passed: "success",
  withdrawn: "neutral",
};

export function ResolutionStatusBadge({
  status,
}: {
  status: ResolutionStatus;
}) {
  return (
    <StatusBadge tone={TONES[status]}>
      {RESOLUTION_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
