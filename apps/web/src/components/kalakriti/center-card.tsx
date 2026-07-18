import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  CenterAssignments,
  type CenterPersonAssignment,
} from "@/components/kalakriti/center-assignments";
import type { PickerUser } from "@/functions/users-for-picker";

export interface CenterListItem {
  competitionEntryRegistrationEnabled: boolean;
  id: string;
  name: string;
  retiredAt: number | null;
  studentRegistrationEnabled: boolean;
}

function RegistrationBadge({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <Badge variant={enabled ? "secondary" : "outline"}>
      {label}: {enabled ? "Open" : "Closed"}
    </Badge>
  );
}

export function CenterCard({
  center,
  editionId,
  guardianAssignments,
  guardianOptions,
  liaisonAssignments,
  onRetryVolunteers,
  onDelete,
  onEdit,
  onRegistrationControls,
  onRetire,
  permissions,
  volunteerOptions,
  volunteerOptionsError,
}: {
  center: CenterListItem;
  editionId: string;
  guardianAssignments: readonly CenterPersonAssignment[];
  guardianOptions: readonly { id: string; name: string }[];
  liaisonAssignments: readonly CenterPersonAssignment[];
  onRetryVolunteers: () => void;
  onDelete: (center: CenterListItem) => void;
  onEdit: (center: CenterListItem) => void;
  onRegistrationControls: (center: CenterListItem) => void;
  onRetire: (center: CenterListItem) => void;
  permissions: {
    manageGuardians: boolean;
    manageLiaisons: boolean;
    manageRegistrationControls: boolean;
    manageStructure: boolean;
  };
  volunteerOptions: readonly PickerUser[];
  volunteerOptionsError: boolean;
}) {
  const isRetired = center.retiredAt !== null;
  const handleControls = useEventCallback(() => onRegistrationControls(center));
  const handleDelete = useEventCallback(() => onDelete(center));
  const handleEdit = useEventCallback(() => onEdit(center));
  const handleRetire = useEventCallback(() => onRetire(center));
  return (
    <Card aria-label={`${center.name} Center`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{center.name}</CardTitle>
            {isRetired ? <Badge variant="outline">Retired</Badge> : null}
          </div>
          <CardDescription className="mt-2 flex flex-wrap gap-2">
            <RegistrationBadge
              enabled={center.studentRegistrationEnabled}
              label="Students"
            />
            <RegistrationBadge
              enabled={center.competitionEntryRegistrationEnabled}
              label="Participation"
            />
          </CardDescription>
        </div>
        {permissions.manageRegistrationControls ||
        permissions.manageStructure ? (
          <div className="flex flex-wrap gap-2">
            {isRetired || !permissions.manageRegistrationControls ? null : (
              <Button onClick={handleControls} size="sm" variant="outline">
                Registration controls
              </Button>
            )}
            {isRetired || !permissions.manageStructure ? null : (
              <>
                <Button onClick={handleEdit} size="sm" variant="ghost">
                  Edit
                </Button>
                <Button onClick={handleRetire} size="sm" variant="ghost">
                  Retire
                </Button>
              </>
            )}
            {permissions.manageStructure ? (
              <Button onClick={handleDelete} size="sm" variant="ghost">
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <CenterAssignments
          allowNewAssignments={!isRetired}
          canManageGuardians={permissions.manageGuardians}
          canManageLiaisons={permissions.manageLiaisons}
          centerId={center.id}
          editionId={editionId}
          guardianAssignments={guardianAssignments}
          guardianOptions={guardianOptions}
          liaisonAssignments={liaisonAssignments}
          onRetryVolunteers={onRetryVolunteers}
          volunteerOptions={volunteerOptions}
          volunteerOptionsError={volunteerOptionsError}
        />
      </CardContent>
    </Card>
  );
}
