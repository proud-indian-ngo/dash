import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { GuardianDetailSheet } from "@/components/kalakriti/guardian-detail-sheet";
import { GuardianEditDialog } from "@/components/kalakriti/guardian-edit-dialog";
import {
  GuardianInviteDialog,
  type GuardianInviteValues,
} from "@/components/kalakriti/guardian-invite-dialog";
import {
  type GuardianRosterItem,
  GuardiansTable,
} from "@/components/kalakriti/guardians-table";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
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
  const [selectedGuardianId, setSelectedGuardianId] = useState<string | null>(
    null
  );
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(
    null
  );
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
  const handleViewGuardian = useEventCallback(
    (guardian: GuardianRosterItem) => {
      setSelectedGuardianId(guardian.id);
    }
  );
  const handleEditGuardian = useEventCallback(
    (guardian: GuardianRosterItem) => {
      setSelectedGuardianId(null);
      setEditingGuardianId(guardian.id);
    }
  );
  const handleArchiveGuardian = useEventCallback(
    (guardian: GuardianRosterItem) => {
      setSelectedGuardianId(null);
      setEditingGuardianId(null);
      archiveAction.trigger(guardian);
    }
  );
  const handleGuardianSheetOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedGuardianId(null);
    }
  });
  const handleEditOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setEditingGuardianId(null);
    }
  });
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

  const guardianRows: GuardianRosterItem[] = guardians.map((guardian) => ({
    id: guardian.id,
    isExternal: guardian.user?.role === "external_user",
    snapshotEmail: guardian.snapshotEmail,
    snapshotName: guardian.snapshotName,
    snapshotPhone: guardian.snapshotPhone,
    state: guardian.state ?? "active",
  }));
  const selectedGuardian =
    guardianRows.find((guardian) => guardian.id === selectedGuardianId) ?? null;
  const editingGuardian =
    guardianRows.find((guardian) => guardian.id === editingGuardianId) ?? null;
  const isLoading =
    guardianRows.length === 0 && rosterResult.type !== "complete";

  if (guardianRows.length === 0 && rosterResult.type === "error") {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
        <p role="alert">Guardians could not be loaded.</p>
        <Button onClick={rosterResult.retry} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Guardians"
      />

      <GuardiansTable
        data={guardianRows}
        isLoading={isLoading}
        onArchive={handleArchiveGuardian}
        onEdit={handleEditGuardian}
        onView={handleViewGuardian}
        toolbarActions={
          <Button onClick={handleInviteOpen}>Invite Guardian</Button>
        }
      />

      <GuardianDetailSheet
        guardian={selectedGuardian}
        onArchive={handleArchiveGuardian}
        onEdit={handleEditGuardian}
        onOpenChange={handleGuardianSheetOpenChange}
        open={selectedGuardian !== null}
      />

      <GuardianEditDialog
        guardian={editingGuardian}
        onOpenChange={handleEditOpenChange}
        open={editingGuardian !== null}
      />

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
