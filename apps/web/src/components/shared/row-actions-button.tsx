import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { cn } from "@pi-dash/design-system/lib/utils";
import type { ComponentProps } from "react";

/** The ⋯ trigger for a table row's ResponsiveActionMenu. Fits a 36px row; grows on touch screens. */
export function RowActionsButton({
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "size" | "variant">) {
  return (
    <Button
      aria-label="Row actions"
      className={cn("size-7 pointer-coarse:size-10", className)}
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
