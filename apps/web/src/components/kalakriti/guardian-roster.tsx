import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

export interface GuardianRosterItem {
  id: string;
  snapshotEmail: string | null;
  snapshotName: string;
  snapshotPhone: string | null;
  state: "active" | "archived";
}

export function GuardianRoster({
  guardians,
  onArchive,
}: {
  guardians: readonly GuardianRosterItem[];
  onArchive: (guardian: GuardianRosterItem) => void;
}) {
  if (guardians.length === 0) {
    return (
      <div className="border border-dashed px-4 py-10 text-center">
        <p className="font-medium">No Guardians yet</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Invite the first Guardian for this Edition.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {guardians.map((guardian) => (
        <GuardianRosterRow
          guardian={guardian}
          key={guardian.id}
          onArchive={onArchive}
        />
      ))}
    </ul>
  );
}

function GuardianRosterRow({
  guardian,
  onArchive,
}: {
  guardian: GuardianRosterItem;
  onArchive: (guardian: GuardianRosterItem) => void;
}) {
  const handleArchive = useEventCallback(() => onArchive(guardian));

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{guardian.snapshotName}</p>
          <Badge
            className="capitalize"
            variant={guardian.state === "active" ? "secondary" : "outline"}
          >
            {guardian.state}
          </Badge>
        </div>
        <p className="mt-1 truncate text-muted-foreground text-sm">
          {guardian.snapshotEmail}
          {guardian.snapshotPhone ? ` · ${guardian.snapshotPhone}` : ""}
        </p>
      </div>
      {guardian.state === "active" ? (
        <Button onClick={handleArchive} size="sm" variant="outline">
          Archive access
        </Button>
      ) : null}
    </li>
  );
}
