import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";

export function KalakritiPageHeader({
  actions,
  badge,
  facts,
  kicker,
  meta,
  title,
  variant = "page",
}: {
  actions?: ReactNode;
  badge?: ReactNode;
  /** Short facts joined with dots, as `PageHeader` `meta`. */
  facts?: readonly ReactNode[];
  kicker?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  variant?: "edition" | "page" | "public";
}) {
  if (variant !== "public") {
    return (
      <PageHeader
        actions={
          actions ? (
            <div className="contents [&_button]:active:scale-[0.96] motion-reduce:[&_button]:active:scale-100">
              {actions}
            </div>
          ) : null
        }
        badge={badge}
        description={meta}
        kicker={kicker}
        meta={facts}
        title={title}
        titleClassName={variant === "edition" ? "text-3xl" : undefined}
      />
    );
  }

  return (
    <header className="flex flex-col flex-wrap items-start justify-between gap-6 md:flex-row md:items-end">
      <div className="min-w-0">
        {kicker ? (
          <p className="text-muted-foreground text-sm font-medium">{kicker}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          {badge}
        </div>
        {meta ? (
          <div className="text-muted-foreground mt-3 text-base sm:text-lg">
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
