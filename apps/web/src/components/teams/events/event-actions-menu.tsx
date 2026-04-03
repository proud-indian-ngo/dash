import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";

export interface EventActionsMenuProps {
  canManage: boolean;
  onCancelEvent: () => void;
  onEditEvent: () => void;
  onSelectEvent: () => void;
}

export function EventActionsMenu({
  canManage,
  onCancelEvent,
  onEditEvent,
  onSelectEvent,
}: EventActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-8"
            data-testid="row-actions"
            onClick={(e) => e.stopPropagation()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4"
              icon={MoreVerticalIcon}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={onSelectEvent}>View</DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem onClick={onEditEvent}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCancelEvent} variant="destructive">
              Cancel
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
