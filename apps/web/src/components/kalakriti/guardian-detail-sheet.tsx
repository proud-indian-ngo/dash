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

import type { GuardianRosterItem } from "@/components/kalakriti/guardians-table";

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value ?? "Not provided"}</span>
    </div>
  );
}

export function GuardianDetailSheet({
  guardian,
  onArchive,
  onEdit,
  onOpenChange,
  open,
}: {
  guardian: GuardianRosterItem | null;
  onArchive: (guardian: GuardianRosterItem) => void;
  onEdit: (guardian: GuardianRosterItem) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
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
      <SheetContent>
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

          <div className="grid gap-4">
            <h3 className="text-sm font-medium">Contact</h3>
            <div className="grid gap-3">
              <DetailRow label="Email" value={guardian.snapshotEmail} />
              <DetailRow label="Phone" value={guardian.snapshotPhone} />
            </div>
          </div>

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
