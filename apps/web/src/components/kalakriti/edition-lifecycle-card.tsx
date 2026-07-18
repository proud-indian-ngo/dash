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
import { getKalakritiRegistrationReadiness } from "@pi-dash/zero/kalakriti-registration-readiness";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
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

export function EditionLifecycleCard({
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
  const isLoading = canManage && !snapshot && result.type !== "complete";
  const lifecycle = snapshot?.lifecycle as RegistrationLifecycle | undefined;
  const blockers = snapshot
    ? getKalakritiRegistrationReadiness({
        ageCategories: snapshot.ageCategories,
        centers: snapshot.centers,
        competitionCategories: snapshot.competitionCategories,
        competitions: snapshot.competitions,
        edition: snapshot,
        quotas: snapshot.centers.flatMap((center) => center.quotas),
        sessions: snapshot.competitionSessions,
        venues: snapshot.venues,
      })
    : [];
  const target = lifecycle ? nextLifecycle(lifecycle) : null;
  const {
    confirmationTarget,
    copy,
    handleOpenChange,
    handleTrigger,
    transition,
  } = useRegistrationLifecycleTransition({ editionId, target });

  if (!canManage) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Registration lifecycle</CardTitle>
            <CardDescription>
              Readiness is checked again by the server when registration opens.
            </CardDescription>
          </div>
          {lifecycle ? (
            <Badge className="capitalize" variant="outline">
              {lifecycle.replaceAll("_", " ")}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div
            aria-label="Loading registration readiness"
            className="flex min-h-20 items-center justify-center"
            role="status"
          >
            <Loader />
          </div>
        ) : null}

        {lifecycle === "draft" && blockers.length > 0 ? (
          <section aria-labelledby="readiness-blockers-heading">
            <p className="font-medium text-sm" id="readiness-blockers-heading">
              Complete these before opening registration
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
              {blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {lifecycle === "registration_open" ? (
          <p className="text-muted-foreground text-sm">
            Registration commands also require the relevant Center control to be
            enabled.
          </p>
        ) : null}
        {lifecycle === "registration_locked" ? (
          <p className="text-muted-foreground text-sm">
            Structural eligibility and Competition rules are frozen. Schedule
            times and Venues can still be corrected safely.
          </p>
        ) : null}

        {copy ? (
          <Button
            disabled={
              isLoading ||
              (lifecycle === "draft" && blockers.length > 0) ||
              transition.isLoading
            }
            onClick={handleTrigger}
            variant={
              confirmationTarget === "registration_locked"
                ? "destructive"
                : "default"
            }
          >
            {copy.confirmLabel}
          </Button>
        ) : null}
      </CardContent>

      {copy ? (
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
      ) : null}
    </Card>
  );
}
