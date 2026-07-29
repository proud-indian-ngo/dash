import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type {
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  VenueTableRow,
} from "./competition-config-types";

export function VenueDetailSheet({
  canManage,
  onDelete,
  onEdit,
  onOpenChange,
  onSetState,
  open,
  venue,
}: {
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
        <SheetHeader>
          <SheetTitle>{venue.name}</SheetTitle>
          <SheetDescription>
            Venue availability and scheduled Competition usage.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <Badge
            className="w-fit"
            variant={venue.retiredAt === null ? "secondary" : "outline"}
          >
            {venue.retiredAt === null ? "Active" : "Retired"}
          </Badge>

          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">
              Scheduled Sessions
            </span>
            <span className="font-display font-semibold text-2xl">
              {venue.sessionCount}
            </span>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={handleEdit}>Edit Venue</Button>
              <Button onClick={handleRetire} variant="outline">
                {venue.retiredAt === null ? "Retire" : "Restore"}
              </Button>
              <Button onClick={handleDelete} variant="destructive">
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
