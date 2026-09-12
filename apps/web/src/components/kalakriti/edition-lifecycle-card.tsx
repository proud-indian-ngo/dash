import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { getKalakritiGoLiveReadiness } from "@pi-dash/zero/kalakriti-go-live-readiness";
import { getKalakritiRegistrationReadiness } from "@pi-dash/zero/kalakriti-registration-readiness";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
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
  const blockers = snapshot
    ? getKalakritiRegistrationReadiness({
        ageCategories: snapshot.ageCategories.map((category) => ({
          ...category,
          femaleStudentLimit: category.femaleStudentLimit ?? 0,
          maleStudentLimit: category.maleStudentLimit ?? 0,
        })),
        centers: snapshot.centers,
        competitionCategories: snapshot.competitionCategories,
        competitions: snapshot.competitions,
        divisions: snapshot.competitionDivisions,
        edition: snapshot,
        sessions: snapshot.competitionSessions,
        venues: snapshot.venues,
      })
    : [];
  const goLiveBlockers = snapshot
    ? getKalakritiGoLiveReadiness({
        ageCategories: snapshot.ageCategories.map((category) => ({
          ...category,
          femaleStudentLimit: category.femaleStudentLimit ?? 0,
          maleStudentLimit: category.maleStudentLimit ?? 0,
        })),
        centers: snapshot.centers,
        competitionCategories: snapshot.competitionCategories,
        competitions: snapshot.competitions,
        divisions: snapshot.competitionDivisions,
        edition: { ...snapshot, lifecycle: snapshot.lifecycle ?? "" },
        sessions: snapshot.competitionSessions,
        venues: snapshot.venues,
        assignments: snapshot.assignments,
        transportAssignments: snapshot.transportAssignments,
      })
    : [];
  const target = lifecycle ? nextLifecycle(lifecycle) : null;
  const action = useRegistrationLifecycleTransition({ editionId, target });
  return {
    ...action,
    blockers,
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

function GoLiveAction({
  editionId,
  ready,
}: {
  editionId: string;
  ready: boolean;
}) {
  const zero = useZero();
  const router = useRouter();
  const connection = useConnectionState();
  const allowed = ready && connection.name === "connected";
  const action = useConfirmAction({
    mutationMeta: {
      entityId: editionId,
      mutation: "kalakritiEdition.transition",
      successMsg: "Edition is now live",
      errorMsg: "Edition could not go live",
    },
    onConfirm: () =>
      allowed
        ? zero.mutate(
            mutators.kalakritiEdition.transition({
              auditEntryId: uuidv7(),
              editionId,
              now: Date.now(),
              confirmed: true,
              targetLifecycle: "live",
            })
          ).server
        : Promise.resolve({
            type: "error" as const,
            error: {
              message:
                "Wait for authoritative go-live readiness and an online connection.",
            },
          }),
    onSuccess: () => router.invalidate(),
  });
  return (
    <>
      <Button
        type="button"
        disabled={!allowed || action.isLoading}
        onClick={() => {
          if (allowed) action.trigger();
        }}
      >
        Go live
      </Button>
      <ConfirmDialog
        title="Go live?"
        description="Scanning will be enabled. Student and Competition Entry registration controls will close for all Centers. Existing person QR codes, lookup, and transport setup remain available."
        confirmLabel="Go live"
        open={action.isOpen}
        loading={action.isLoading}
        confirmDisabled={!allowed}
        onConfirm={action.confirm}
        onOpenChange={(open) => {
          if (!open && !action.isLoading) action.cancel();
        }}
      />
    </>
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
    handleOpenChange,
    handleTrigger,
    readinessUnavailable,
    transition,
    lifecycle,
    goLiveBlockers,
  } = useEditionLifecycle({ canManage, editionId });

  if (!(canManage && copy)) {
    return null;
  }

  return (
    <>
      {lifecycle === "registration_locked" ? (
        <GoLiveAction
          key={editionId}
          editionId={editionId}
          ready={!readinessUnavailable && goLiveBlockers.length === 0}
        />
      ) : null}
      <Button
        disabled={
          readinessUnavailable || blockers.length > 0 || transition.isLoading
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
      {lifecycle === "registration_locked" && goLiveBlockers.length > 0 ? (
        <section aria-labelledby="go-live-blockers-heading">
          <p id="go-live-blockers-heading" className="text-sm font-medium">
            Complete these before going live
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
            {goLiveBlockers.map((blocker) => (
              <li key={blocker.code}>{blocker.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {lifecycle === "live" ? (
        <KalakritiLockNotice>
          Scanning is enabled. Registration remains closed.
        </KalakritiLockNotice>
      ) : null}
      {lifecycle === "registration_open" ? (
        <KalakritiLockNotice>
          Registration commands also require the relevant Center control to be
          enabled.
        </KalakritiLockNotice>
      ) : null}
      {lifecycle === "registration_locked" ? (
        <KalakritiLockNotice>
          Structural eligibility and Competition rules are frozen. Schedule
          times and Venues can still be corrected safely. Go live once lead
          assignments and transport are ready.
        </KalakritiLockNotice>
      ) : null}
    </div>
  );
}
