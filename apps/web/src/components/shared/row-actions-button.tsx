import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentProps } from "react";

/**
 * The ⋯ trigger for a table row's ResponsiveActionMenu. Fits a 36px row
 * (its cell's padding and border leave 27px, so it overhangs by a pixel each
 * way, keeping data rows as tall as skeleton rows); grows on touch screens to
 * what the 52px actions column holds, and the menu trigger's 44px hit area
 * covers the rest.
 */
export function RowActionsButton({
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size" | "variant">) {
  return (
    <Button
      aria-label="Row actions"
      className={cn("-my-px size-7 pointer-coarse:size-9", className)}
      data-testid="row-actions"
      size="icon"
      type="button"
      variant="ghost"
      {...props}
    >
      <HugeiconsIcon
        className="size-4"
        icon={MoreVerticalIcon}
        strokeWidth={2}
      />
    </Button>
  );
}
