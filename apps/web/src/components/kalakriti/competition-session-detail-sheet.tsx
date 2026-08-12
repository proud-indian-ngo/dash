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
import { useMemo } from "react";
import type {
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
  ScheduleTableRow,
} from "./competition-config-types";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function CompetitionSessionDetailSheet({
  canDelete,
  canManage,
  onDelete,
  onEdit,
  onOpenChange,
  onSetState,
  open,
  session,
  timeZone,
}: {
  canDelete: boolean;
  canManage: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (session: ScheduleTableRow) => void;
  onOpenChange: (open: boolean) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  open: boolean;
  session: ScheduleTableRow | null;
  timeZone: string;
}) {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }),
    [timeZone]
  );
  const label = session
    ? `${session.competitionName}, ${session.ageCategoryName}`
    : "";
  const handleEdit = useEventCallback(() => {
    if (session) {
      onEdit(session);
    }
  });
  const handleCancel = useEventCallback(() => {
    if (session) {
      onSetState({
        action: session.cancelledAt === null ? "Cancel" : "Restore",
        enabled: session.cancelledAt === null,
        id: session.id,
        kind: "session_cancelled",
        name: label,
      });
    }
  });
  const handleDelete = useEventCallback(() => {
    if (session) {
      onDelete({ id: session.id, kind: "session", name: label });
    }
  });

  if (!session) {
    return null;
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{session.competitionName}</SheetTitle>
          <SheetDescription>
            {session.ageCategoryName} Competition Session details.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <Badge
            className="w-fit"
            variant={session.cancelledAt === null ? "secondary" : "outline"}
          >
            {session.cancelledAt === null ? "Scheduled" : "Cancelled"}
          </Badge>

          <div className="grid gap-4">
            <h3 className="font-medium text-sm">Schedule</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Age Category" value={session.ageCategoryName} />
              <DetailRow label="Venue" value={session.venueName} />
              <DetailRow
                label={`Starts (${timeZone})`}
                value={formatter.format(session.startAt)}
              />
              <DetailRow
                label={`Ends (${timeZone})`}
                value={formatter.format(session.endAt)}
              />
            </div>
          </div>

          {canManage || canDelete ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {canManage ? (
                <>
                  <Button onClick={handleEdit}>Edit Session</Button>
                  <Button onClick={handleCancel} variant="outline">
                    {session.cancelledAt === null ? "Cancel" : "Restore"}
                  </Button>
                </>
              ) : null}
              {canDelete ? (
                <Button onClick={handleDelete} variant="destructive">
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
