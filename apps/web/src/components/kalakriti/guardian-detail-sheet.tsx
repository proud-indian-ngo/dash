import { Archive02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

import type { GuardianRosterItem } from "@/components/kalakriti/guardians-table";
import { PersonQrPanel } from "@/components/kalakriti/person-qr-panel";
import { Loader } from "@/components/loader";
import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { hasEffectiveGuardianCheckIn } from "@/lib/kalakriti-guardian-policy";

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
  canManage,
  guardian,
  onArchive,
  onEdit,
  onOpenChange,
  open,
}: {
  access: KalakritiEditionAccess;
  canManage: boolean;
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
        <DetailSheetHeader
          actions={
            canManage && guardian.state === "active" ? (
              <>
                <Button onClick={handleEdit} type="button" variant="outline">
                  <HugeiconsIcon
                    className="size-4"
                    icon={Edit02Icon}
                    strokeWidth={2}
                  />
                  Edit details
                </Button>
                <PageHeaderMenu
                  actions={[
                    {
                      destructive: true,
                      icon: Archive02Icon,
                      id: "archive",
                      label: "Archive access",
                      onSelect: handleArchive,
                    },
                  ]}
                  title={`${guardian.snapshotName} actions`}
                />
              </>
            ) : null
          }
          badge={
            <StatusBadge
              className="capitalize"
              tone={guardian.state === "active" ? "success" : "neutral"}
            >
              {guardian.state}
            </StatusBadge>
          }
          description="Guardian login access and contact details for this Edition."
          title={guardian.snapshotName}
        />

        <div className="flex flex-col gap-6 px-6 pb-6">
          <DetailRow label="Yearly ID" value={guardian.humanId ?? "—"} />
          <DetailRow
            label="Check-in"
            value={
              hasEffectiveGuardianCheckIn(guardian.operations)
                ? "Checked in"
                : "Not checked in"
            }
          />
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
            {centers.length > 0 ? (
              <div className="divide-y rounded-lg border">
                {centers.map((center) => (
                  <div className="grid gap-2 p-3" key={center.id}>
                    <h4 className="text-sm font-medium">{center.name}</h4>
                    <DetailRow
                      label="Status"
                      value={center.retiredAt ? "Retired" : "Active"}
                    />
                    <DetailRow
                      label="Student registration"
                      value={
                        center.studentRegistrationEnabled
                          ? access.edition.lifecycle === "registration_open"
                            ? "Open"
                            : "Edition locked"
                          : "Closed"
                      }
                    />
                    <DetailRow
                      label="Entry registration"
                      value={
                        center.competitionEntryRegistrationEnabled
                          ? access.edition.lifecycle === "registration_open"
                            ? "Open"
                            : "Edition locked"
                          : "Closed"
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
