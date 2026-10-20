import {
  Archive02Icon,
  Delete02Icon,
  Edit02Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import { getKalakritiCenterTransportLabel } from "@pi-dash/zero/kalakriti-center-scan-rules";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { PageHeaderMenu } from "@/components/shared/page-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getCenterTransportCapabilities } from "@/lib/kalakriti-center-registration-policy";
import { isAwaitingResult } from "@/lib/zero-result";

import type { CenterPersonAssignment } from "./center-assignments";
import { CenterTransportSection } from "./center-transport-section";
import type { CenterTableRow } from "./centers-table";
import { ParticipationComplianceBadge } from "./participation-compliance-badge";
import { useTransportStatusSnapshot } from "./use-transport-status-snapshot";

function centerStatus(center: CenterTableRow) {
  return getKalakritiCenterTransportLabel(center.scanStages ?? []);
}

type CenterGuardianDetail = CenterPersonAssignment & {
  email: string | null;
  humanId: string | null;
  phone: string | null;
};

function Guardians({
  guardians,
  loading,
}: {
  guardians: readonly CenterGuardianDetail[];
  loading: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-medium">Guardians</h3>
      {loading ? (
        <Skeleton aria-label="Loading Guardians" className="h-20 w-full" />
      ) : guardians.length ? (
        <ul aria-label="Guardians" className="divide-y rounded-md border">
          {guardians.map((guardian) => (
            <li className="space-y-2 p-3 text-sm" key={guardian.id}>
              <div>
                <p className="font-medium">{guardian.name}</p>
                <p className="text-muted-foreground text-xs">
                  {guardian.humanId ?? "Yearly ID not assigned"}
                </p>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs">Phone</dt>
                  <dd>
                    {guardian.phone ? (
                      <a
                        className="text-primary underline pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
                        href={`tel:${guardian.phone}`}
                      >
                        {guardian.phone}
                      </a>
                    ) : (
                      "Not provided"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Email</dt>
                  <dd className="break-all">
                    {guardian.email ? (
                      <a
                        className="text-primary underline pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
                        href={`mailto:${guardian.email}`}
                      >
                        {guardian.email}
                      </a>
                    ) : (
                      "Not provided"
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No guardians assigned.</p>
      )}
    </section>
  );
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
  guardianAssignments: readonly CenterGuardianDetail[];
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
            <StatusBadge
              tone={center.retiredAt === null ? "success" : "neutral"}
            >
              {center.retiredAt === null ? "Active" : "Retired"}
            </StatusBadge>
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
                className="text-primary underline pointer-coarse:inline-flex pointer-coarse:min-h-10 pointer-coarse:items-center"
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
            <dd>
              {center.studentRegistrationEnabled
                ? access.edition.lifecycle === "registration_open"
                  ? "Open"
                  : "Edition locked"
                : "Closed"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Participation registration
            </dt>
            <dd>
              {center.competitionEntryRegistrationEnabled
                ? access.edition.lifecycle === "registration_open"
                  ? "Open"
                  : "Edition locked"
                : "Closed"}
            </dd>
          </div>
        </dl>
        <ParticipationComplianceBadge compliance={center.compliance} />
      </section>
      {canViewGuardians ? (
        <Guardians guardians={guardianAssignments} loading={guardiansLoading} />
      ) : null}
      {canViewLiaisons ? (
        <People
          title="Liaisons"
          people={liaisonAssignments}
          loading={liaisonsLoading}
        />
      ) : null}
      {canViewTransport ? (
        assignments.length === 0 && isAwaitingResult(transportResult) ? (
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
  guardianAssignments: readonly CenterGuardianDetail[];
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
        <DetailSheetHeader
          actions={
            center ? (
              <>
                {canEdit ? (
                  <Button
                    onClick={() => onEdit(center)}
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
                ) : null}
                {canManageRegistrationControls && center.retiredAt === null ? (
                  <Button
                    onClick={() => onControls(center)}
                    type="button"
                    variant="outline"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={SlidersHorizontalIcon}
                      strokeWidth={2}
                    />
                    Registration controls
                  </Button>
                ) : null}
                <PageHeaderMenu
                  actions={[
                    canConfigure &&
                      center.retiredAt === null && {
                        icon: Archive02Icon,
                        id: "retire",
                        label: "Retire",
                        onSelect: () => onRetire(center),
                      },
                    canConfigure && {
                      destructive: true,
                      icon: Delete02Icon,
                      id: "delete",
                      label: "Delete center",
                      onSelect: () => onDelete(center),
                    },
                  ]}
                  title={`${center.name} actions`}
                />
              </>
            ) : null
          }
          className="px-4"
          description="Center details, registration, assignments, and transport."
          title={
            center?.name ?? (complete ? "Center not found" : "Loading Center")
          }
        />
        <div className="space-y-6 px-4 pb-6">
          {center ? (
            <>
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
