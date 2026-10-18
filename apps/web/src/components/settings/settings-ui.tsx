import { cn } from "@pi-dash/design-system/lib/utils";
import type { ReactNode } from "react";

/**
 * A titled group of settings rows in one framed card. The title is optional
 * when the page header already names the group.
 */
export function SettingsCard({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex flex-col gap-2", className)}
    >
      {title || action ? (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="divide-y rounded-lg border">{children}</div>
    </section>
  );
}

/**
 * One setting: what it is on the left, its control on the right. `inline`
 * keeps a switch or checkbox beside the text on phones and makes the whole
 * row its label, so tapping anywhere on it toggles the control.
 */
export function SettingsRow({
  children,
  description,
  inline = false,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  inline?: boolean;
  title: ReactNode;
}) {
  const Root = inline ? "label" : "div";
  return (
    <Root
      className={cn(
        "flex gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        inline ? "cursor-pointer items-center justify-between" : "flex-col"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </Root>
  );
}

/**
 * The save row at the end of a long form. While there are unsaved changes it
 * pins to the bottom of the screen, above the phone tab bar, with a summary.
 */
export function SaveBar({
  children,
  dirty,
  summary = "Unsaved changes",
}: {
  children: ReactNode;
  dirty: boolean;
  summary?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-x-4 gap-y-2",
        dirty &&
          "bg-background sticky bottom-(--mobile-tab-bar-height) z-10 border-t py-3 max-md:-mx-4 max-md:px-4"
      )}
      data-slot="save-bar"
    >
      {dirty ? (
        <p className="text-muted-foreground mr-auto text-sm" role="status">
          {summary}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** One item in a framed settings list: name and detail, then its actions. */
export function SettingsListItem({
  actions,
  children,
  detail,
}: {
  actions?: ReactNode;
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div
      className="flex min-h-11 items-center gap-3 px-4 py-2"
      data-slot="settings-list-item"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{children}</div>
        {detail ? (
          <div className="text-muted-foreground truncate text-xs">{detail}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}
