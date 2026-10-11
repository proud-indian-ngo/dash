import {
  Cancel01Icon,
  Copy01Icon,
  Edit02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";

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
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );

  return (
    <ResponsiveActionMenu
      title="Event actions"
      trigger={<RowActionsButton onClick={stableOnClick0} />}
      actions={[
        { id: "view", icon: ViewIcon, label: "View", onSelect: onSelectEvent },
        canCreate && {
          id: "duplicate",
          icon: Copy01Icon,
          label: "Duplicate",
          onSelect: onDuplicateEvent,
        },
        canManage && {
          id: "edit",
          icon: Edit02Icon,
          label: "Edit",
          onSelect: onEditEvent,
        },
        canCancel && {
          id: "cancel",
          icon: Cancel01Icon,
          label: "Cancel",
          onSelect: onCancelEvent,
          destructive: true,
          group: canManage ? "destructive" : undefined,
        },
      ]}
    />
  );
}
