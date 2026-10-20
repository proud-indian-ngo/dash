import {
  MEETING_STATUS_LABELS,
  type MeetingStatus,
} from "@pi-dash/shared/meetings";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

const TONES: Record<MeetingStatus, StatusTone> = {
  cancelled: "neutral",
  convened: "info",
  draft: "neutral",
  held: "success",
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <StatusBadge tone={TONES[status]}>
      {MEETING_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
