import { cn } from "@pi-dash/design-system/lib/utils";
import type { ReactNode } from "react";

export function KalakritiPageHeader({
  actions,
  badge,
  kicker,
  meta,
  title,
  variant = "page",
}: {
  actions?: ReactNode;
  badge?: ReactNode;
  kicker?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  variant?: "edition" | "page" | "public";
}) {
  let titleClass =
    "text-balance font-display font-semibold text-2xl tracking-tight";
  if (variant === "public") {
    titleClass =
      "mt-3 text-balance font-semibold text-3xl tracking-tight sm:text-4xl";
  } else if (variant === "edition") {
    titleClass =
      "text-balance font-display font-semibold text-3xl tracking-tight";
  }

  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        variant === "public" && "flex-col gap-6 md:flex-row md:items-end"
      )}
    >
      <div className="min-w-0">
        {kicker ? (
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">
            {kicker}
          </p>
        ) : null}
        <div
          className={cn(
            "flex flex-wrap items-center gap-3",
            kicker && variant !== "public" && "mt-2"
          )}
        >
          <h1 className={titleClass}>{title}</h1>
          {badge}
        </div>
        {meta ? (
          <div
            className={cn(
              "text-muted-foreground",
              variant === "public"
                ? "mt-3 text-base sm:text-lg"
                : "mt-2 text-sm tabular-nums"
            )}
          >
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 [&_button]:active:scale-[0.96] motion-reduce:[&_button]:active:scale-100">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
