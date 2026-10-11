import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentProps, ReactNode } from "react";

import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";

/**
 * The one header every app page uses: the title (with an optional status or
 * tag beside it), an optional muted line under it, and the page's actions on
 * the right. Actions hold at most one primary button and one or two outline
 * buttons; everything else goes in a `PageHeaderMenu`.
 */
export function PageHeader({
  actions,
  badge,
  className,
  description,
  kicker,
  meta,
  title,
  titleClassName,
}: {
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
  /** One plain sentence on what the page is for. */
  description?: ReactNode;
  /** A small label above the title. */
  kicker?: ReactNode;
  /** Key facts about the record, joined with dots. Falsy items are skipped. */
  meta?: readonly ReactNode[];
  title: ReactNode;
  titleClassName?: string;
}) {
  const metaItems = (meta ?? []).filter(Boolean);

  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className
      )}
    >
      <div className="min-w-0">
        {kicker ? (
          <p className="text-primary mb-2 text-sm font-medium tracking-[0.16em] uppercase">
            {kicker}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1
            className={cn(
              "font-display text-2xl font-semibold tracking-tight text-balance",
              titleClassName
            )}
          >
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <div className="text-muted-foreground mt-1 text-sm text-pretty">
            {description}
          </div>
        ) : null}
        {metaItems.length > 0 ? (
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
            {metaItems.map((item, index) => (
              <span className="flex items-center gap-2" key={index}>
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** The ⋯ button holding a page's secondary and destructive actions. */
export function PageHeaderMenu({
  actions,
  title,
}: Pick<ComponentProps<typeof ResponsiveActionMenu>, "actions" | "title">) {
  return (
    <ResponsiveActionMenu
      actions={actions}
      title={title}
      trigger={
        <Button
          aria-label="More actions"
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon
            className="size-4"
            icon={MoreHorizontalIcon}
            strokeWidth={2}
          />
        </Button>
      }
    />
  );
}
