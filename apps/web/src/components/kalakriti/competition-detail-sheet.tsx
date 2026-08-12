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
import {
  type CompetitionTableRow,
  type ConfigurationDeletePayload,
  type ConfigurationStatePayload,
  formatConfigurationLabel,
} from "./competition-config-types";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm capitalize">{value}</span>
    </div>
  );
}

export function CompetitionDetailSheet({
  canManageCancellations,
  canManageStructure,
  competition,
  onDelete,
  onEdit,
  onOpenChange,
  onSetState,
  open,
}: {
  canManageCancellations: boolean;
  canManageStructure: boolean;
  competition: CompetitionTableRow | null;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionTableRow) => void;
  onOpenChange: (open: boolean) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  open: boolean;
}) {
  const handleEdit = useEventCallback(() => {
    if (competition) {
      onEdit(competition);
    }
  });
  const handleCancel = useEventCallback(() => {
    if (competition) {
      onSetState({
        action: competition.cancelledAt === null ? "Cancel" : "Restore",
        enabled: competition.cancelledAt === null,
        id: competition.id,
        kind: "competition_cancelled",
        name: competition.name,
      });
    }
  });
  const handleRetire = useEventCallback(() => {
    if (competition) {
      onSetState({
        action: competition.retiredAt === null ? "Retire" : "Restore",
        enabled: competition.retiredAt === null,
        id: competition.id,
        kind: "competition_retired",
        name: competition.name,
      });
    }
  });
  const handleDelete = useEventCallback(() => {
    if (competition) {
      onDelete({
        id: competition.id,
        kind: "competition",
        name: competition.name,
      });
    }
  });

  if (!competition) {
    return null;
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{competition.name}</SheetTitle>
          <SheetDescription>
            Competition eligibility, participation, and lifecycle details.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="flex flex-wrap gap-2">
            {competition.cancelledAt === null &&
            competition.retiredAt === null ? (
              <Badge variant="secondary">Active</Badge>
            ) : null}
            {competition.cancelledAt === null ? null : (
              <Badge variant="destructive">Cancelled</Badge>
            )}
            {competition.retiredAt === null ? null : (
              <Badge variant="outline">Retired</Badge>
            )}
          </div>

          <div className="grid gap-4">
            <h3 className="font-medium text-sm">Configuration</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailRow label="Category" value={competition.categoryName} />
              <DetailRow
                label="Participation"
                value={formatConfigurationLabel(competition.participationMode)}
              />
              <DetailRow
                label="Gender eligibility"
                value={formatConfigurationLabel(competition.genderEligibility)}
              />
              <DetailRow
                label="Group size"
                value={`${competition.minimumGroupSize}-${competition.maximumGroupSize}`}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <h3 className="font-medium text-sm">Competition Divisions</h3>
            {competition.divisions.map((division) => (
              <div className="rounded-md border px-3 py-2" key={division.id}>
                <span className="text-sm">
                  {division.ageCategory?.name ?? "Unknown Age Category"}
                </span>
              </div>
            ))}
          </div>

          {canManageCancellations || canManageStructure ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {canManageStructure ? (
                <Button onClick={handleEdit}>Edit Competition</Button>
              ) : null}
              {canManageCancellations ? (
                <Button onClick={handleCancel} variant="outline">
                  {competition.cancelledAt === null ? "Cancel" : "Restore"}
                </Button>
              ) : null}
              {canManageStructure ? (
                <>
                  <Button onClick={handleRetire} variant="outline">
                    {competition.retiredAt === null ? "Retire" : "Restore"}
                  </Button>
                  <Button onClick={handleDelete} variant="destructive">
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
