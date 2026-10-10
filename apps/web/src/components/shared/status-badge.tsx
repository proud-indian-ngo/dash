import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentProps } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-foreground/80 before:bg-muted-foreground",
  info: "bg-info/10 text-info-foreground before:bg-info dark:bg-info/14",
  success:
    "bg-success/12 text-success-foreground before:bg-success dark:bg-success-foreground/14",
  warning:
    "bg-warning/15 text-warning-foreground before:bg-warning dark:bg-warning-foreground/14",
  danger:
    "bg-destructive/10 text-destructive before:bg-destructive dark:bg-destructive/14",
};

/** A state that can change (pending, approved, live). Colour always pairs with a word. */
export function StatusBadge({
  children,
  className,
  tone = "neutral",
  ...props
}: ComponentProps<"span"> & { tone?: StatusTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 w-fit max-w-full min-w-0 items-center gap-1.5 rounded-[5px] px-2 text-[11.5px] font-semibold whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:content-['']",
        TONE_CLASS[tone],
        className
      )}
      data-slot="status-badge"
      data-tone={tone}
      {...props}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A fixed label or category (role, type, count). Never carries meaning through colour. */
export function Tag({ children, className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-foreground/80 ring-border inline-flex h-5.5 w-fit max-w-full min-w-0 items-center gap-1 rounded-[5px] px-1.75 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset [&>svg]:size-3 [&>svg]:shrink-0",
        className
      )}
      data-slot="tag"
      {...props}
    >
      {typeof children === "string" ? (
        <span className="truncate">{children}</span>
      ) : (
        children
      )}
    </span>
  );
}
