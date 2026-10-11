import {
  ArrowTurnBackwardIcon,
  Archive02Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";

import type {
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  VenueTableRow,
} from "./competition-config-types";

export function VenueDetailSheet({
  canEdit,
  canManage,
  onDelete,
  onEdit,
  onOpenChange,
  onSetState,
  open,
  venue,
}: {
  canEdit: boolean;
  canManage: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (venue: VenueTableRow) => void;
  onOpenChange: (open: boolean) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  open: boolean;
  venue: VenueTableRow | null;
}) {
  const handleEdit = useEventCallback(() => {
    if (venue) {
      onEdit(venue);
    }
  });
  const handleRetire = useEventCallback(() => {
    if (venue) {
      onSetState({
        action: venue.retiredAt === null ? "Retire" : "Restore",
        enabled: venue.retiredAt === null,
        id: venue.id,
        kind: "venue_retired",
        name: venue.name,
      });
    }
  });
  const handleDelete = useEventCallback(() => {
    if (venue) {
      onDelete({ id: venue.id, kind: "venue", name: venue.name });
    }
  });

  if (!venue) {
    return null;
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <DetailSheetHeader
          actions={
            <>
              {canEdit ? (
                <Button onClick={handleEdit} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
              ) : null}
              <PageHeaderMenu
                actions={[
                  canManage && {
                    icon:
                      venue.retiredAt === null
                        ? Archive02Icon
                        : ArrowTurnBackwardIcon,
                    id: "retire",
                    label: venue.retiredAt === null ? "Retire" : "Restore",
                    onSelect: handleRetire,
                  },
                  canManage && {
                    destructive: true,
                    icon: Delete02Icon,
                    id: "delete",
                    label: "Delete venue",
                    onSelect: handleDelete,
                  },
                ]}
                title={`${venue.name} actions`}
              />
            </>
          }
          badge={
            <StatusBadge
              tone={venue.retiredAt === null ? "success" : "neutral"}
            >
              {venue.retiredAt === null ? "Active" : "Retired"}
            </StatusBadge>
          }
          description="Venue availability and scheduled Competition usage."
          title={venue.name}
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">
              Scheduled Sessions
            </span>
            <span className="font-display text-2xl font-semibold">
              {venue.sessionCount}
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
