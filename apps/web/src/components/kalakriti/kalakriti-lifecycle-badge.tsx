import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { cn } from "@pi-dash/design-system/lib/utils";

export function formatKalakritiLifecycle(lifecycle: string) {
  return lifecycle.replaceAll("_", " ");
}

const LIFECYCLE_BADGE: Record<
  string,
  { className?: string; variant: "default" | "outline" | "secondary" }
> = {
  archived: { variant: "secondary" },
  draft: { variant: "outline" },
  live: { variant: "default" },
  registration_locked: {
    className: "border-warning/40 bg-warning/10 text-warning-foreground",
    variant: "outline",
  },
  registration_open: {
    className: "border-success/40 bg-success/10 text-success-foreground",
    variant: "outline",
  },
};

export function KalakritiLifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const style = LIFECYCLE_BADGE[lifecycle] ?? { variant: "outline" as const };
  return (
    <Badge
      className={cn("capitalize", style.className)}
      variant={style.variant}
    >
      {formatKalakritiLifecycle(lifecycle)}
    </Badge>
  );
}
