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
  canCancel: boolean;
  canCreate: boolean;
  canManage: boolean;
  onCancelEvent: () => void;
  onDuplicateEvent: () => void;
  onEditEvent: () => void;
  onSelectEvent: () => void;
}

export function EventActionsMenu({
  canCancel,
  canCreate,
  canManage,
  onCancelEvent,
  onDuplicateEvent,
  onEditEvent,
  onSelectEvent,
}: EventActionsMenuProps) {
  const stableOnClick0 = (e: any) => e.stopPropagation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-8"
            data-testid="row-actions"
            onClick={stableOnClick0}
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
        {Boolean(canCreate) && (
          <DropdownMenuItem onClick={onDuplicateEvent}>
            Duplicate
          </DropdownMenuItem>
        )}
        {Boolean(canManage) && (
          <DropdownMenuItem onClick={onEditEvent}>Edit</DropdownMenuItem>
        )}
        {Boolean(canManage && canCancel) && <DropdownMenuSeparator />}
        {Boolean(canCancel) && (
          <DropdownMenuItem onClick={onCancelEvent} variant="destructive">
            Cancel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
