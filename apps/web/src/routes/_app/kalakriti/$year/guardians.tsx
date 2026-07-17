import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import {
  GuardianInviteDialog,
  type GuardianInviteValues,
} from "@/components/kalakriti/guardian-invite-dialog";
import {
  GuardianRoster,
  type GuardianRosterItem,
} from "@/components/kalakriti/guardian-roster";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  archiveKalakritiGuardian,
  inviteKalakritiGuardian,
} from "@/functions/kalakriti-guardian";
import { useConfirmAction } from "@/hooks/use-confirm-action";

interface ReusePayload extends GuardianInviteValues {
  existingName: string;
}

export const Route = createFileRoute("/_app/kalakriti/$year/guardians")({
  beforeLoad: ({ context }) => {
    const access = context.kalakritiEditionAccess;
    if (
      !(
        access.isGlobalAdmin ||
        access.membership?.responsibilities.includes("edition_admin")
      )
    ) {
      throw notFound();
    }
  },
  component: KalakritiGuardiansPage,
});

function KalakritiGuardiansPage() {
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [guardians, rosterResult] = useQuery(
    queries.kalakritiGuardian.roster({ editionId: edition.id })
  );

  const archiveAction = useConfirmAction<GuardianRosterItem>({
    onConfirm: async (guardian) => {
      try {
        await archiveKalakritiGuardian({
          data: { membershipId: guardian.id },
        });
        return { type: "success" };
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Guardian access could not be archived";
        log.error({
          action: "archiveGuardian",
          component: "KalakritiGuardiansPage",
          editionId: edition.id,
          error: message,
          membershipId: guardian.id,
        });
        return { error: { message }, type: "error" };
      }
    },
    onError: (message) =>
      toast.error(message ?? "Guardian access could not be archived"),
    onSuccess: () => toast.success("Guardian access archived"),
  });

  const reuseAction = useConfirmAction<ReusePayload>({
    onConfirm: async (payload) => {
      try {
        await inviteKalakritiGuardian({
          data: {
            confirmReuse: true,
            editionId: edition.id,
            email: payload.email,
            name: payload.name,
            password: payload.password || undefined,
            phone: payload.phone || undefined,
          },
        });
        return { type: "success" };
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Guardian access could not be reactivated";
        log.error({
          action: "reactivateGuardian",
          component: "KalakritiGuardiansPage",
          editionId: edition.id,
          error: message,
        });
        return { error: { message }, type: "error" };
      }
    },
    onError: (message) =>
      toast.error(message ?? "Guardian access could not be reactivated"),
    onSuccess: () => toast.success("Guardian access reactivated"),
  });

  const handleRequiresConfirmation = useEventCallback(
    (values: GuardianInviteValues, existingName: string) => {
      reuseAction.trigger({ ...values, existingName });
    }
  );
  const handleInviteOpen = useEventCallback(() => setInviteOpen(true));
  const handleArchiveOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      archiveAction.cancel();
    }
  });
  const handleReuseOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      reuseAction.cancel();
    }
  });

  let rosterContent = (
    <div
      aria-label="Loading Guardians"
      className="flex min-h-32 items-center justify-center"
      role="status"
    >
      <Loader />
    </div>
  );
  if (rosterResult.type === "complete") {
    rosterContent = (
      <GuardianRoster
        guardians={guardians.map((guardian) => ({
          ...guardian,
          state: guardian.state ?? "active",
        }))}
        onArchive={archiveAction.trigger}
      />
    );
  } else if (rosterResult.type === "error") {
    rosterContent = (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
        <p role="alert">Guardians could not be loaded.</p>
        <Button onClick={rosterResult.retry} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Guardians</CardTitle>
            <CardDescription className="mt-1">
              Manage login access for this Edition. Archived external accounts
              remain dormant until an administrator reuses their verified email
              in a later Edition.
            </CardDescription>
          </div>
          <Button onClick={handleInviteOpen}>Invite Guardian</Button>
        </CardHeader>
        <CardContent>{rosterContent}</CardContent>
      </Card>

      <GuardianInviteDialog
        editionId={edition.id}
        onOpenChange={setInviteOpen}
        onRequiresConfirmation={handleRequiresConfirmation}
        open={inviteOpen}
      />
      <ConfirmDialog
        confirmLabel="Archive access"
        description={`Archive ${archiveAction.payload?.snapshotName ?? "this Guardian"}'s access to ${edition.name}? A dedicated external account will be blocked if this is its final active Edition; central account access is unchanged.`}
        loading={archiveAction.isLoading}
        loadingLabel="Archiving..."
        onConfirm={archiveAction.confirm}
        onOpenChange={handleArchiveOpenChange}
        open={archiveAction.isOpen}
        title="Archive Guardian access?"
      />
      <ConfirmDialog
        confirmLabel="Reuse account"
        description={`A dormant external account for ${reuseAction.payload?.existingName ?? "this email"} already exists. Reuse its existing credentials and grant access to ${edition.name}?`}
        loading={reuseAction.isLoading}
        loadingLabel="Reactivating..."
        onConfirm={reuseAction.confirm}
        onOpenChange={handleReuseOpenChange}
        open={reuseAction.isOpen}
        title="Reuse dormant Guardian account?"
        variant="default"
      />
    </div>
  );
}
