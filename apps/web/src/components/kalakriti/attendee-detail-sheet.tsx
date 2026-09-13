import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";

import { type AttendeeRow, AttendeeStatus } from "./attendees-table";
import { PersonQrPanel } from "./person-qr-panel";

export function AttendeeDetailSheet({
  attendee,
  canManage,
  statusReady,
  onClose,
  onEdit,
  onArchive,
  onAssign,
}: {
  attendee: AttendeeRow | null;
  canManage: boolean;
  statusReady: boolean;
  onClose: () => void;
  onEdit: (row: AttendeeRow) => void;
  onArchive: (row: AttendeeRow) => void;
  onAssign: (row: AttendeeRow) => void;
}) {
  return (
    <Sheet
      open={attendee !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        aria-label={attendee?.name ?? "Attendee"}
        className="overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{attendee?.name ?? "Attendee"}</SheetTitle>
          <SheetDescription>
            Yearly roster details and event-day status.
          </SheetDescription>
        </SheetHeader>
        {attendee ? (
          <div className="space-y-5 px-4 pb-6">
            <dl className="grid gap-3">
              {[
                ["Yearly ID", attendee.humanId || "—"],
                ["Phone", attendee.phone],
                ["Email", attendee.email || "Not provided"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="text-sm">{value}</dd>
                </div>
              ))}
              {(
                [
                  ["attendee_check_in", "Checked in"],
                  ["breakfast", "Breakfast"],
                  ["lunch", "Lunch"],
                ] as const
              ).map(([type, label]) => (
                <div key={type}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd>
                    <AttendeeStatus
                      row={attendee}
                      type={type}
                      ready={statusReady}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            {attendee.kind === "judge" ? (
              <section>
                <h3 className="text-sm font-medium">Competitions</h3>
                {attendee.judgeAssignments.length ? (
                  <ul>
                    {attendee.judgeAssignments.map((a) => (
                      <li key={a.competitionId}>
                        {a.competition?.name ?? "Competition"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">Unassigned</p>
                )}
              </section>
            ) : null}
            <PersonQrPanel id={attendee.id} type={attendee.kind} />
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onEdit(attendee)} variant="outline">
                  Edit
                </Button>
                {attendee.kind === "judge" ? (
                  <Button onClick={() => onAssign(attendee)} variant="outline">
                    Assign competitions
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  onClick={() => onArchive(attendee)}
                >
                  Archive
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
