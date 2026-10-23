import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { GIVE_INDIA_PARTY_ID } from "@pi-dash/shared/constants";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { DonorDetailSheet } from "@/components/donors/donor-detail-sheet";
import { DonorFormDialog } from "@/components/donors/donor-form-dialog";
import { DonorsTable } from "@/components/donors/donors-table";
import type { PartyRow } from "@/components/donors/party-row";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import { deleteDonor } from "@/functions/parties";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isAwaitingResult } from "@/lib/zero-result";

export const Route = createFileRoute("/_app/donors/")({
  component: DonorsRouteComponent,
  head: () => ({
    meta: [{ title: `Donors | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.party.all(),
      abortController.signal
    );
  },
});

function DonorsRouteComponent() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("donors.manage");
  const [parties, partiesResult] = useQuery(queries.party.all());
  const isLoading = parties.length === 0 && isAwaitingResult(partiesResult);
  const rows = (parties ?? []) as PartyRow[];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const viewing = viewingId
    ? (rows.find((p) => p.id === viewingId) ?? null)
    : null;

  const openCreate = useEventCallback(() => {
    setEditing(null);
    setFormOpen(true);
  });
  const handleEdit = useEventCallback((party: PartyRow) => {
    setEditing(party);
    setFormOpen(true);
  });
  const handleView = useEventCallback((party: PartyRow) =>
    setViewingId(party.id)
  );
  const handleDetailOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setViewingId(null);
    }
  });
  const handleSaved = useEventCallback((partyId: string) => {
    setDetailsVersion((n) => n + 1);
    if (!viewingId) {
      setViewingId(partyId);
    }
  });
  const handleFormOpenChange = useEventCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setEditing(null);
    }
  });

  const removeDonor = useServerFn(deleteDonor);
  const deleteAction = useConfirmAction<PartyRow>({
    onConfirm: async (party) => {
      let removed: Awaited<ReturnType<typeof removeDonor>>["removed"];
      try {
        ({ removed } = await removeDonor({ data: { partyId: party.id } }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong";
        log.error({
          action: "party.delete",
          caughtError: message,
          component: "DonorsRoute",
          entityId: party.id,
        });
        return { error: { message }, type: "error" };
      }
      toast.success(
        removed === "party" ? "Donor deleted" : "Removed from donors"
      );
      setViewingId((current) => (current === party.id ? null : current));
      return { type: "success" };
    },
    onError: (message) =>
      toast.error("Couldn't delete donor", { description: message }),
  });
  const handleDelete = useEventCallback((party: PartyRow) =>
    deleteAction.trigger(party)
  );
  const handleDeleteOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={openCreate} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add donor
            </Button>
          ) : null
        }
        description="People and organisations that give, sponsor or route money to the trust. Contact details stay on the server; identifiers are masked and only finance can reveal them."
        title="Donors"
      />
      <div className="mt-6">
        <DonorsTable
          canManage={canManage}
          data={rows}
          isLoading={isLoading}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onView={handleView}
        />
      </div>
      <DonorFormDialog
        onOpenChange={handleFormOpenChange}
        onSaved={handleSaved}
        open={formOpen}
        party={editing}
      />
      <DonorDetailSheet
        canManage={canManage}
        onDelete={
          viewing?.id === GIVE_INDIA_PARTY_ID ? undefined : handleDelete
        }
        onEdit={handleEdit}
        onOpenChange={handleDetailOpenChange}
        open={viewing !== null}
        party={viewing}
        version={detailsVersion}
      />
      <ConfirmDialog
        confirmLabel="Delete donor"
        description={`This will delete ${deleteAction.payload?.displayName ?? "this donor"}, or only remove them from donors if they're also a vendor or volunteer. A donor with gifts can't be deleted.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={handleDeleteOpenChange}
        open={deleteAction.isOpen}
        title="Delete donor"
      />
    </div>
  );
}
