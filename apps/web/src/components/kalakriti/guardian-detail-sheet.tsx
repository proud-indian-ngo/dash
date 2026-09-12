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
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

import type { GuardianRosterItem } from "@/components/kalakriti/guardians-table";
import { PersonQrPanel } from "@/components/kalakriti/person-qr-panel";
import { Loader } from "@/components/loader";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? "Not provided"}</span>
    </div>
  );
}

export function GuardianDetailSheet({
  access,
  guardian,
  onArchive,
  onEdit,
  onOpenChange,
  open,
}: {
  access: KalakritiEditionAccess;
  guardian: GuardianRosterItem | null;
  onArchive: (guardian: GuardianRosterItem) => void;
  onEdit: (guardian: GuardianRosterItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [centerAssignments, centersResult] = useQuery(
    queries.kalakritiCenter.guardianAssignments({
      editionId: access.edition.id,
    })
  );
  const centers = centerAssignments.flatMap((assignment) =>
    assignment.membershipId === guardian?.id && assignment.center
      ? [assignment.center]
      : []
  );
  const centersLoading =
    centerAssignments.length === 0 && centersResult.type !== "complete";

  const handleArchive = useEventCallback(() => {
    if (guardian) {
      onArchive(guardian);
    }
  });
  const handleEdit = useEventCallback(() => {
    if (guardian) {
      onEdit(guardian);
    }
  });

  if (!guardian) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{guardian.snapshotName}</SheetTitle>
          <SheetDescription>
            Guardian login access and contact details for this Edition.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <Badge
            className="w-fit capitalize"
            variant={guardian.state === "active" ? "secondary" : "outline"}
          >
            {guardian.state}
          </Badge>

          <DetailRow label="Yearly ID" value={guardian.humanId ?? "—"} />
          <PersonQrPanel enabled={open} id={guardian.id} type="guardian" />

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Contact</h3>
            <div className="grid gap-3">
              <DetailRow label="Email" value={guardian.snapshotEmail} />
              <DetailRow label="Phone" value={guardian.snapshotPhone} />
            </div>
          </div>

          <section aria-label="Center details" className="grid gap-3">
            <h3 className="text-sm font-medium">Center details</h3>
            {centersLoading ? <Loader /> : null}
            {!centersLoading && centers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No Centers assigned.
              </p>
            ) : null}
            {centers.map((center) => (
              <div className="grid gap-2 rounded-md border p-3" key={center.id}>
                <h4 className="text-sm font-medium">{center.name}</h4>
                <DetailRow
                  label="Status"
                  value={center.retiredAt ? "Retired" : "Active"}
                />
                <DetailRow
                  label="Student registration"
                  value={center.studentRegistrationEnabled ? "Open" : "Closed"}
                />
                <DetailRow
                  label="Entry registration"
                  value={
                    center.competitionEntryRegistrationEnabled
                      ? "Open"
                      : "Closed"
                  }
                />
              </div>
            ))}
          </section>

          {guardian.state === "active" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleEdit} type="button">
                Edit details
              </Button>
              <Button
                className="w-fit"
                onClick={handleArchive}
                type="button"
                variant="outline"
              >
                Archive access
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
