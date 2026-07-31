import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { CenterPersonAssignment } from "@/components/kalakriti/center-assignments";
import { CenterDetail } from "@/components/kalakriti/center-detail";
import type { CenterListItem } from "@/components/kalakriti/centers-table";
import { Loader } from "@/components/loader";
import {
  getKalakritiVolunteersForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";

export const Route = createFileRoute("/_app/kalakriti/$year/centers/$id")({
  component: KalakritiCenterDetailPage,
  loader: ({ context }) => {
    const { edition } = context.kalakritiEditionAccess;
    context.zero?.preload(
      queries.kalakritiCenter.visible({ editionId: edition.id })
    );
    context.zero?.preload(
      queries.kalakritiCenter.guardianAssignments({ editionId: edition.id })
    );
    context.zero?.preload(
      queries.kalakritiCenter.liaisonAssignments({ editionId: edition.id })
    );
    context.zero?.preload(
      queries.kalakritiGuardian.roster({ editionId: edition.id })
    );
  },
});

function KalakritiCenterDetailPage() {
  const navigate = useNavigate();
  const { id, year } = Route.useParams();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const responsibilities = new Set(access.membership?.responsibilities ?? []);
  const canManageCenters =
    access.isGlobalAdmin || responsibilities.has("edition_admin");
  const canManageGuardians = canManageCenters;
  const canManageLiaisons =
    canManageCenters || responsibilities.has("volunteer_coordinator");
  const fullyLocked =
    edition.lifecycle === "live" || edition.lifecycle === "archived";
  const structuralLocked =
    edition.lifecycle === "registration_locked" || fullyLocked;
  const canConfigureCenters = canManageCenters && !structuralLocked;
  const canManageRegistrationControls = canManageCenters && !fullyLocked;
  const [centers, centerResult] = useQuery(
    queries.kalakritiCenter.visible({ editionId: edition.id })
  );
  const [guardianAssignments] = useQuery(
    queries.kalakritiCenter.guardianAssignments({ editionId: edition.id }),
    { enabled: canManageGuardians }
  );
  const [liaisonAssignments] = useQuery(
    queries.kalakritiCenter.liaisonAssignments({ editionId: edition.id }),
    { enabled: canManageLiaisons }
  );
  const [guardians] = useQuery(
    queries.kalakritiGuardian.roster({ editionId: edition.id }),
    { enabled: canManageGuardians }
  );
  const [volunteerOptions, setVolunteerOptions] = useState<PickerUser[]>([]);
  const [volunteerOptionsError, setVolunteerOptionsError] = useState(false);

  const loadVolunteerOptions = useCallback(
    () =>
      getKalakritiVolunteersForPicker({
        data: { editionId: edition.id },
      })
        .then((users) => {
          setVolunteerOptions(users);
          setVolunteerOptionsError(false);
        })
        .catch(() => {
          setVolunteerOptions([]);
          setVolunteerOptionsError(true);
        }),
    [edition.id]
  );

  useEffect(() => {
    if (canManageLiaisons) {
      loadVolunteerOptions();
    }
  }, [canManageLiaisons, loadVolunteerOptions]);

  const handleVolunteerRetry = useEventCallback(() => {
    loadVolunteerOptions();
  });
  const handleDeleted = useEventCallback(() => {
    navigate({
      params: { year },
      to: "/kalakriti/$year/centers",
    });
  });

  const centerRow = centers.find((item) => item.id === id);
  const center: CenterListItem | null = centerRow
    ? {
        ...centerRow,
        competitionEntryRegistrationEnabled: Boolean(
          centerRow.competitionEntryRegistrationEnabled
        ),
        studentRegistrationEnabled: Boolean(
          centerRow.studentRegistrationEnabled
        ),
      }
    : null;
  const guardianRows: CenterPersonAssignment[] = guardianAssignments.flatMap(
    (item) =>
      item.centerId === id
        ? [
            {
              centerId: item.centerId,
              id: item.id,
              membershipId: item.membershipId,
              name: item.membership?.snapshotName ?? "Unknown Guardian",
            },
          ]
        : []
  );
  const liaisonRows: CenterPersonAssignment[] = liaisonAssignments.flatMap(
    (item) =>
      item.centerId === id
        ? [
            {
              centerId: item.centerId ?? "",
              id: item.id,
              membershipId: item.membershipId,
              name: item.membership?.snapshotName ?? "Unknown Liaison",
            },
          ]
        : []
  );
  const assignedGuardianIds = new Set(
    guardianRows.map((item) => item.membershipId)
  );
  const guardianOptions = guardians.flatMap((guardian) =>
    guardian.state === "active" && !assignedGuardianIds.has(guardian.id)
      ? [{ id: guardian.id, name: guardian.snapshotName }]
      : []
  );
  const isLoading = centers.length === 0 && centerResult.type !== "complete";

  if (isLoading) {
    return (
      <div
        aria-label="Loading Center"
        className="flex min-h-48 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }

  if (!center) {
    return (
      <div className="space-y-4 py-12 text-center">
        <div>
          <h1 className="font-display font-semibold text-xl">
            Center not found
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            This Center does not exist or is not available to your account.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link params={{ year }} to="/kalakriti/$year/centers" />}
          variant="outline"
        >
          Back to Centers
        </Button>
      </div>
    );
  }

  return (
    <CenterDetail
      capabilities={{
        configureCenters: canConfigureCenters,
        manageCenters: canManageCenters,
        manageGuardians: canManageGuardians,
        manageLiaisons: canManageLiaisons,
        manageRegistrationControls: canManageRegistrationControls,
      }}
      center={center}
      configurationLocked={structuralLocked}
      editionId={edition.id}
      editionLifecycle={edition.lifecycle}
      guardianAssignments={guardianRows}
      guardianOptions={guardianOptions}
      liaisonAssignments={liaisonRows}
      onDeleted={handleDeleted}
      onRetryVolunteers={handleVolunteerRetry}
      volunteerOptions={volunteerOptions}
      volunteerOptionsError={volunteerOptionsError}
      year={year}
    />
  );
}
