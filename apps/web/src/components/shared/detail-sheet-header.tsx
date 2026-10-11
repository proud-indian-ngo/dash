import { cn } from "@pi-dash/design-system/lib/utils";
import type { ReactNode } from "react";

import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shared/responsive-sheet";

/**
 * The header every detail sheet uses, following the same rules as
 * `PageHeader`: the title, then its status and short facts, then at most one
 * or two buttons with everything else in a `PageHeaderMenu`.
 */
export function DetailSheetHeader({
  actions,
  badge,
  className,
  description,
  leading,
  meta,
  title,
}: {
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
  /** Shown under the title; screen readers get a fallback when omitted. */
  description?: ReactNode;
  /** An avatar or image before the title. */
  leading?: ReactNode;
  /** Short facts, joined with dots. Falsy items are skipped. */
  meta?: readonly ReactNode[];
  title: ReactNode;
}) {
  const metaItems = (meta ?? []).filter(Boolean);
  const hasFacts = Boolean(badge) || metaItems.length > 0;

  return (
    <SheetHeader
      className={cn("mb-5 gap-0 border-b px-6 pt-5 pb-4 sm:pr-12", className)}
    >
      <div className="flex items-start gap-3">
        {leading}
        <div className="min-w-0">
          <SheetTitle className="text-base font-semibold text-balance">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="mt-0.5 text-sm">
              {description}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details</SheetDescription>
          )}
          {hasFacts ? (
            <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
              {badge}
              {metaItems.map((item, index) => (
                <span className="flex items-center gap-2" key={index}>
                  {index > 0 || badge ? (
                    <span aria-hidden="true">·</span>
                  ) : null}
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </SheetHeader>
  );
}
