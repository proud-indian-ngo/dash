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

import type { EventRow } from "@/components/teams/events/events-table-helpers";

export interface EventActionsMenuProps {
  canManage: boolean;
  event: EventRow;
  onCancelEvent: (event: EventRow) => void;
  onEditEvent: (event: EventRow) => void;
  onSelectEvent: (event: EventRow) => void;
}

export function EventActionsMenu({
  canManage,
  event,
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
            className="size-7"
            data-testid="row-actions"
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
        <DropdownMenuItem onClick={() => onSelectEvent(event)}>
          View
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem onClick={() => onEditEvent(event)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onCancelEvent(event)}
              variant="destructive"
            >
              Cancel
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
