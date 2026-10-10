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
      contentClassName="w-32"
      trigger={<RowActionsButton onClick={stableOnClick0} />}
      actions={[
        { id: "view", label: "View", onSelect: onSelectEvent },
        canCreate && {
          id: "duplicate",
          label: "Duplicate",
          onSelect: onDuplicateEvent,
        },
        canManage && { id: "edit", label: "Edit", onSelect: onEditEvent },
        canCancel && {
          id: "cancel",
          label: "Cancel",
          onSelect: onCancelEvent,
          destructive: true,
          group: canManage ? "destructive" : undefined,
        },
      ]}
    />
  );
}
