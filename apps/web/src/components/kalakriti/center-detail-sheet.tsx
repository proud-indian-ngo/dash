import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@pi-dash/design-system/components/ui/sheet";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import { getKalakritiCenterTransportLabel } from "@pi-dash/zero/kalakriti-center-scan-rules";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getCenterTransportCapabilities } from "@/lib/kalakriti-center-registration-policy";

import type { CenterPersonAssignment } from "./center-assignments";
import { CenterTransportSection } from "./center-transport-section";
import type { CenterTableRow } from "./centers-table";
import { ParticipationComplianceBadge } from "./participation-compliance-badge";
import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

function centerStatus(center: CenterTableRow) {
  return getKalakritiCenterTransportLabel(center.scanStages ?? []);
}
function People({
  title,
  people,
  loading,
}: {
  title: string;
  people: readonly CenterPersonAssignment[];
  loading: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {loading ? (
        <Skeleton aria-label={`Loading ${title}`} className="h-8 w-full" />
      ) : people.length ? (
        <ul aria-label={title} className="space-y-2">
          {people.map((person) => (
            <li key={person.id} className="text-sm">
              {person.name}
              {person.responsibility ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {KALAKRITI_RESPONSIBILITY_LABELS[person.responsibility]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No {title.toLowerCase()} assigned.
        </p>
      )}
    </section>
  );
}

function CenterSheetDetails({
  center,
  access,
  complete,
  guardianAssignments,
  liaisonAssignments,
  guardiansLoading,
  liaisonsLoading,
  canViewGuardians,
  canViewLiaisons,
}: {
  center: CenterTableRow;
  access: KalakritiEditionAccess;
  complete: boolean;
  guardianAssignments: readonly CenterPersonAssignment[];
  liaisonAssignments: readonly CenterPersonAssignment[];
  guardiansLoading: boolean;
  liaisonsLoading: boolean;
  canViewGuardians: boolean;
  canViewLiaisons: boolean;
}) {
  const { canViewTransport } = getCenterTransportCapabilities({
    access,
    centerId: center.id,
    lifecycle: access.edition.lifecycle,
    guardianCenterVisible: true,
  });
  const [assignments, transportResult] = useQuery(
    queries.kalakritiTransport.byCenter({
      editionId: access.edition.id,
      centerId: center.id,
    }),
    { enabled: canViewTransport }
  );
  const rows = useMemo(() => [center], [center]);
  const status = useTransportStatusSnapshot({
    data: rows,
    scopeKey: `${access.edition.id}:${center.id}`,
    complete,
    getStatus: centerStatus,
  });
  return (
    <div className="space-y-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge
              variant={center.retiredAt === null ? "secondary" : "outline"}
            >
              {center.retiredAt === null ? "Active" : "Retired"}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Transport status</dt>
          <dd>
            {status.labels?.get(center.id) ?? (
              <Skeleton
                aria-label="Loading transport status"
                className="h-5 w-28"
              />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location</dt>
          <dd className="break-words whitespace-pre-wrap">
            {center.location || "Not provided"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Google Maps</dt>
          <dd>
            {center.googleMapsUrl?.startsWith("https://") ? (
              <a
                className="text-primary underline"
                href={center.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Google Maps
              </a>
            ) : (
              "Not provided"
            )}
          </dd>
        </div>
      </dl>
      <section className="space-y-3">
        <h3 className="font-medium">Registration access</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Student registration</dt>
            <dd>{center.studentRegistrationEnabled ? "Open" : "Closed"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Participation registration
            </dt>
            <dd>
              {center.competitionEntryRegistrationEnabled ? "Open" : "Closed"}
            </dd>
          </div>
        </dl>
        <ParticipationComplianceBadge compliance={center.compliance} />
      </section>
      {canViewGuardians ? (
        <People
          title="Guardians"
          people={guardianAssignments}
          loading={guardiansLoading}
        />
      ) : null}
      {canViewLiaisons ? (
        <People
          title="Liaisons"
          people={liaisonAssignments}
          loading={liaisonsLoading}
        />
      ) : null}
      {canViewTransport ? (
        assignments.length === 0 && transportResult.type !== "complete" ? (
          <Skeleton
            aria-label="Loading transport assignments"
            className="h-24 w-full"
          />
        ) : (
          <CenterTransportSection assignments={assignments} />
        )
      ) : null}
    </div>
  );
}

export function CenterDetailSheet({
  center,
  access,
  complete,
  open,
  onClose,
  canEdit,
  canConfigure,
  canManageRegistrationControls,
  onEdit,
  onControls,
  onRetire,
  onDelete,
  ...details
}: {
  center: CenterTableRow | null;
  access: KalakritiEditionAccess;
  complete: boolean;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  canConfigure: boolean;
  canManageRegistrationControls: boolean;
  onEdit: (center: CenterTableRow) => void;
  onControls: (center: CenterTableRow) => void;
  onRetire: (center: CenterTableRow) => void;
  onDelete: (center: CenterTableRow) => void;
  guardianAssignments: readonly CenterPersonAssignment[];
  liaisonAssignments: readonly CenterPersonAssignment[];
  guardiansLoading: boolean;
  liaisonsLoading: boolean;
  canViewGuardians: boolean;
  canViewLiaisons: boolean;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {center?.name ?? (complete ? "Center not found" : "Loading Center")}
          </SheetTitle>
          <SheetDescription>
            Center details, registration, assignments, and transport.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          {center ? (
            <>
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(center)}
                  >
                    Edit
                  </Button>
                ) : null}
                {canManageRegistrationControls && center.retiredAt === null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onControls(center)}
                  >
                    Registration controls
                  </Button>
                ) : null}
                {canConfigure && center.retiredAt === null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRetire(center)}
                  >
                    Retire
                  </Button>
                ) : null}
                {canConfigure ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(center)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
              <CenterSheetDetails
                key={`${access.edition.id}:${center.id}`}
                center={center}
                access={access}
                complete={complete}
                {...details}
              />
            </>
          ) : complete ? (
            <p className="text-muted-foreground text-sm">
              This Center does not exist or is not available to your account.
            </p>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
