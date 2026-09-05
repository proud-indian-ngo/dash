import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { getKalakritiGoLiveReadiness } from "@pi-dash/zero/kalakriti-go-live-readiness";
import { getKalakritiRegistrationReadiness } from "@pi-dash/zero/kalakriti-registration-readiness";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { KalakritiLockNotice } from "@/components/kalakriti/kalakriti-lock-notice";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

type RegistrationLifecycle =
  | "draft"
  | "registration_open"
  | "registration_locked"
  | "live"
  | "archived";

type RegistrationTransitionTarget = "registration_locked" | "registration_open";

function nextLifecycle(lifecycle: RegistrationLifecycle) {
  if (lifecycle === "draft" || lifecycle === "registration_locked") {
    return "registration_open" as const;
  }
  if (lifecycle === "registration_open") {
    return "registration_locked" as const;
  }
  return null;
}

function transitionCopy(target: "registration_locked" | "registration_open") {
  if (target === "registration_locked") {
    return {
      confirmLabel: "Lock registration",
      description:
        "Student and Competition Entry registration will stop immediately, including for clients that are already open.",
      title: "Lock registration?",
    };
  }
  return {
    confirmLabel: "Open registration",
    description:
      "Registration will be available only at Centers whose individual controls are enabled. This does not change any Center control.",
    title: "Open registration?",
  };
}

function buildReadinessSnapshot(snapshot: {
  ageCategories: readonly {
    femaleStudentLimit: number | null;
    maleStudentLimit: number | null;
    maximumAge: number;
    minimumAge: number;
    id: string;
  }[];
  assignments?: readonly { responsibility: string }[];
  centers: readonly {
    competitionEntryRegistrationEnabled: boolean | null;
    id: string;
    retiredAt: number | null;
    studentRegistrationEnabled: boolean | null;
  }[];
  competitionCategories: readonly { id: string; retiredAt: number | null }[];
  competitions: readonly {
    cancelledAt: number | null;
    competitionCategoryId: string;
    editionId: string;
    id: string;
    retiredAt: number | null;
  }[];
  competitionDivisions: readonly {
    ageCategoryId: string;
    competitionId: string;
    id: string;
  }[];
  competitionSessions: readonly {
    cancelledAt: number | null;
    divisionId: string;
    endAt: number;
    id: string;
    startAt: number;
    venueId: string;
  }[];
  credentials?: readonly {
    membershipId: string | null;
    revokedAt: number | null;
    studentId: string | null;
  }[];
  lifecycle: string;
  ageCutoffDate: number;
  eventDate: number;
  plannedRegistrationCloseAt: number;
  timezone: string | null;
  memberships?: readonly {
    kind: string;
    state: string;
    id: string;
  }[];
  students?: readonly { id: string }[];
  transportAssignments?: readonly { centerId: string }[];
  venues: readonly { id: string; retiredAt: number | null }[];
}) {
  return {
    ageCategories: snapshot.ageCategories.map((category) => ({
      ...category,
      femaleStudentLimit: category.femaleStudentLimit ?? 0,
      maleStudentLimit: category.maleStudentLimit ?? 0,
    })),
    assignments: snapshot.assignments ?? [],
    centers: snapshot.centers.map((center) => ({
      ...center,
      competitionEntryRegistrationEnabled:
        center.competitionEntryRegistrationEnabled ?? false,
      studentRegistrationEnabled: center.studentRegistrationEnabled ?? false,
    })),
    competitionCategories: snapshot.competitionCategories,
    competitions: snapshot.competitions,
    credentials: snapshot.credentials ?? [],
    divisions: snapshot.competitionDivisions,
    edition: {
      ageCutoffDate: snapshot.ageCutoffDate,
      eventDate: snapshot.eventDate,
      lifecycle: snapshot.lifecycle,
      plannedRegistrationCloseAt: snapshot.plannedRegistrationCloseAt,
      timezone: snapshot.timezone,
    },
    sessions: snapshot.competitionSessions,
    students: snapshot.students ?? [],
    transportAssignments: snapshot.transportAssignments ?? [],
    venues: snapshot.venues,
    volunteerMemberships: (snapshot.memberships ?? []).filter(
      (membership) =>
        membership.kind === "volunteer" && membership.state === "active"
    ),
  };
}

function useRegistrationLifecycleTransition({
  editionId,
  target,
}: {
  editionId: string;
  target: RegistrationTransitionTarget | null;
}) {
  const zero = useZero();
  const router = useRouter();
  const [requestedTarget, setRequestedTarget] =
    useState<RegistrationTransitionTarget | null>(null);
  const transition = useConfirmAction({
    mutationMeta: {
      entityId: editionId,
      errorMsg: "Couldn't change registration lifecycle",
      mutation: "kalakritiEdition.transition",
      successMsg:
        (requestedTarget ?? target) === "registration_locked"
          ? "Registration locked"
          : "Registration opened",
    },
    onConfirm: () => {
      const confirmedTarget = requestedTarget ?? target;
      if (!confirmedTarget) {
        return Promise.resolve({
          error: { message: "No lifecycle transition is available" },
          type: "error",
        });
      }
      return zero.mutate(
        mutators.kalakritiEdition.transition({
          auditEntryId: uuidv7(),
          confirmed: true,
          editionId,
          now: Date.now(),
          targetLifecycle: confirmedTarget,
        })
      ).server;
    },
    onSuccess: () => router.invalidate(),
  });
  const confirmationTarget = transition.isOpen
    ? (requestedTarget ?? target)
    : target;
  const handleTrigger = useEventCallback(() => {
    if (target) {
      setRequestedTarget(target);
      transition.trigger();
    }
  });
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      transition.cancel();
      setRequestedTarget(null);
    }
  });

  return {
    confirmationTarget,
    copy: confirmationTarget ? transitionCopy(confirmationTarget) : null,
    handleOpenChange,
    handleTrigger,
    transition,
  };
}

function useGoLiveTransition({ editionId }: { editionId: string }) {
  const zero = useZero();
  const router = useRouter();
  const transition = useConfirmAction({
    mutationMeta: {
      entityId: editionId,
      errorMsg: "Edition could not go live",
      mutation: "kalakritiEdition.transition",
      successMsg: "Edition is now live",
    },
    onConfirm: () =>
      zero.mutate(
        mutators.kalakritiEdition.transition({
          auditEntryId: uuidv7(),
          confirmed: true,
          editionId,
          now: Date.now(),
          targetLifecycle: "live",
        })
      ).server,
    onSuccess: () => router.invalidate(),
  });

  return transition;
}

function useEditionLifecycle({
  canManage,
  editionId,
}: {
  canManage: boolean;
  editionId: string;
}) {
  const [snapshot, result] = useQuery(
    queries.kalakritiEdition.readiness({ editionId }),
    { enabled: canManage }
  );
  const isLoading =
    canManage &&
    !snapshot &&
    result.type !== "complete" &&
    result.type !== "error";
  const readinessUnavailable = result.type !== "complete" || !snapshot;
  const lifecycle = snapshot?.lifecycle as RegistrationLifecycle | undefined;
  const readinessSnapshot = snapshot
    ? buildReadinessSnapshot(
        snapshot as Parameters<typeof buildReadinessSnapshot>[0]
      )
    : null;
  const blockers = readinessSnapshot
    ? getKalakritiRegistrationReadiness(readinessSnapshot)
    : [];
  const goLiveBlockers = readinessSnapshot
    ? getKalakritiGoLiveReadiness(readinessSnapshot)
    : [];
  const target = lifecycle ? nextLifecycle(lifecycle) : null;
  const action = useRegistrationLifecycleTransition({ editionId, target });
  const goLive = useGoLiveTransition({ editionId });
  return {
    ...action,
    blockers,
    goLive,
    goLiveBlockers,
    isLoading,
    lifecycle,
    readinessUnavailable,
    result,
  };
}

function RegistrationReadinessBlockers({
  blockers,
  lifecycle,
}: {
  blockers: ReturnType<typeof getKalakritiRegistrationReadiness>;
  lifecycle: RegistrationLifecycle | undefined;
}) {
  if (
    (lifecycle !== "draft" &&
      lifecycle !== "registration_open" &&
      lifecycle !== "registration_locked") ||
    blockers.length === 0
  ) {
    return null;
  }
  let action = "reopening";
  if (lifecycle === "draft") {
    action = "opening";
  } else if (lifecycle === "registration_open") {
    action = "locking";
  }

  return (
    <section aria-labelledby="readiness-blockers-heading">
      <p className="text-sm font-medium" id="readiness-blockers-heading">
        Complete these before {action} registration
      </p>
      <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
        {blockers.map((blocker) => (
          <li key={blocker.code}>{blocker.message}</li>
        ))}
      </ul>
    </section>
  );
}

function GoLiveReadinessBlockers({
  blockers,
  lifecycle,
}: {
  blockers: ReturnType<typeof getKalakritiGoLiveReadiness>;
  lifecycle: RegistrationLifecycle | undefined;
}) {
  if (lifecycle !== "registration_locked" || blockers.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="go-live-blockers-heading">
      <p className="text-sm font-medium" id="go-live-blockers-heading">
        Complete these before going live
      </p>
      <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
        {blockers.map((blocker) => (
          <li key={blocker.code}>{blocker.message}</li>
        ))}
      </ul>
    </section>
  );
}

export function EditionLifecycleAction({
  canManage,
  editionId,
}: {
  canManage: boolean;
  editionId: string;
}) {
  const {
    blockers,
    confirmationTarget,
    copy,
    goLive,
    goLiveBlockers,
    handleOpenChange,
    handleTrigger,
    lifecycle,
    readinessUnavailable,
    transition,
  } = useEditionLifecycle({ canManage, editionId });

  const handleGoLiveOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      goLive.cancel();
    }
  });

  if (!canManage) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {copy ? (
        <>
          <Button
            disabled={
              readinessUnavailable ||
              blockers.length > 0 ||
              transition.isLoading
            }
            onClick={handleTrigger}
            type="button"
            variant={
              confirmationTarget === "registration_locked"
                ? "destructive"
                : "default"
            }
          >
            {copy.confirmLabel}
          </Button>
          <ConfirmDialog
            confirmLabel={copy.confirmLabel}
            description={copy.description}
            loading={transition.isLoading}
            onConfirm={transition.confirm}
            onOpenChange={handleOpenChange}
            open={transition.isOpen}
            title={copy.title}
            variant={
              confirmationTarget === "registration_locked"
                ? "destructive"
                : "default"
            }
          />
        </>
      ) : null}
      {lifecycle === "registration_locked" ? (
        <>
          <Button
            disabled={
              readinessUnavailable ||
              goLiveBlockers.length > 0 ||
              goLive.isLoading
            }
            onClick={goLive.trigger}
            type="button"
          >
            Go live
          </Button>
          <ConfirmDialog
            confirmLabel="Go live"
            description="Event-day operations will be enabled. Center registration controls will be confirmed closed. Print, lookup, and transport setup remain available."
            loading={goLive.isLoading}
            onConfirm={goLive.confirm}
            onOpenChange={handleGoLiveOpenChange}
            open={goLive.isOpen}
            title="Go live?"
          />
        </>
      ) : null}
    </div>
  );
}

export function EditionLifecycleAlerts({
  canManage,
  editionId,
}: {
  canManage: boolean;
  editionId: string;
}) {
  const { blockers, goLiveBlockers, isLoading, lifecycle, result } =
    useEditionLifecycle({
      canManage,
      editionId,
    });

  if (!canManage) {
    return null;
  }

  if (result.type === "error") {
    return (
      <div className="space-y-3" role="alert">
        <p className="font-medium">
          Registration readiness could not be loaded.
        </p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
        <Button onClick={result.retry} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        aria-label="Loading registration readiness"
        className="flex min-h-12 items-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RegistrationReadinessBlockers
        blockers={blockers}
        lifecycle={lifecycle}
      />
      <GoLiveReadinessBlockers
        blockers={goLiveBlockers}
        lifecycle={lifecycle}
      />
      {lifecycle === "registration_open" ? (
        <KalakritiLockNotice>
          Registration commands also require the relevant Center control to be
          enabled.
        </KalakritiLockNotice>
      ) : null}
      {lifecycle === "registration_locked" ? (
        <KalakritiLockNotice>
          Structural eligibility and Competition rules are frozen. Schedule
          times and Venues can still be corrected safely. Go live when
          transport, Credentials, and lead assignments are ready.
        </KalakritiLockNotice>
      ) : null}
      {lifecycle === "live" ? (
        <KalakritiLockNotice>
          Event-day operations are enabled. Registration remains closed.
        </KalakritiLockNotice>
      ) : null}
    </div>
  );
}
