import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

export function formatKalakritiLifecycle(lifecycle: string) {
  return lifecycle.replaceAll("_", " ");
}

const LIFECYCLE_TONES: Record<string, StatusTone> = {
  archived: "neutral",
  draft: "neutral",
  live: "success",
  registration_locked: "warning",
  registration_open: "success",
};

export function KalakritiLifecycleBadge({ lifecycle }: { lifecycle: string }) {
  return (
    <StatusBadge
      className="capitalize"
      tone={LIFECYCLE_TONES[lifecycle] ?? "neutral"}
    >
      {formatKalakritiLifecycle(lifecycle)}
    </StatusBadge>
  );
}
