import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

/** "registration_locked" → "registration locked", for use mid-sentence. */
export function formatKalakritiLifecycle(lifecycle: string) {
  return lifecycle.replaceAll("_", " ");
}

/** The badge label: "Registration locked". */
function lifecycleLabel(lifecycle: string) {
  const words = formatKalakritiLifecycle(lifecycle);
  return words.charAt(0).toUpperCase() + words.slice(1);
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
    <StatusBadge tone={LIFECYCLE_TONES[lifecycle] ?? "neutral"}>
      {lifecycleLabel(lifecycle)}
    </StatusBadge>
  );
}
