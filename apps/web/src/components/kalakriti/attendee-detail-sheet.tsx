import {
  Archive02Icon,
  Delete02Icon,
  Edit02Icon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";

import { type AttendeeRow, AttendeeStatus } from "./attendees-table";
import { PersonQrPanel } from "./person-qr-panel";

export function AttendeeDetailSheet({
  attendee,
  canManage,
  statusReady,
  onClose,
  onEdit,
  onRemove,
  onAssign,
}: {
  attendee: AttendeeRow | null;
  canManage: boolean;
  statusReady: boolean;
  onClose: () => void;
  onEdit: (row: AttendeeRow) => void;
  onRemove: (row: AttendeeRow) => void;
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
        <DetailSheetHeader
          actions={
            attendee && canManage ? (
              <>
                <Button
                  onClick={() => onEdit(attendee)}
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit
                </Button>
                {attendee.kind === "judge" ? (
                  <Button
                    onClick={() => onAssign(attendee)}
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={UserAdd01Icon}
                      strokeWidth={2}
                    />
                    Assign competitions
                  </Button>
                ) : null}
                <PageHeaderMenu
                  actions={[
                    {
                      destructive: true,
                      icon:
                        attendee.kind === "judge"
                          ? Delete02Icon
                          : Archive02Icon,
                      id: "remove",
                      label: attendee.kind === "judge" ? "Delete" : "Archive",
                      onSelect: () => onRemove(attendee),
                    },
                  ]}
                  title={`${attendee.name} actions`}
                />
              </>
            ) : null
          }
          className="px-4"
          description="Yearly roster details and event-day status."
          title={attendee?.name ?? "Attendee"}
        />
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
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
