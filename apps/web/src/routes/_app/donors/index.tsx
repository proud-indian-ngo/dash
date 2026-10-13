import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DonorDetailSheet } from "@/components/donors/donor-detail-sheet";
import { DonorFormDialog } from "@/components/donors/donor-form-dialog";
import { DonorsTable } from "@/components/donors/donors-table";
import type { PartyRow } from "@/components/donors/party-row";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import { preloadRouteQuery } from "@/lib/route-preload";

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
  const isLoading = parties.length === 0 && partiesResult.type !== "complete";
  const rows = (parties ?? []) as PartyRow[];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
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
  const handleFormOpenChange = useEventCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setEditing(null);
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
        description="People and organisations that give, sponsor or route money to the trust. Contact and ID details stay on the server and are shown here only to finance."
        title="Donors"
      />
      <div className="mt-6">
        <DonorsTable
          canManage={canManage}
          data={rows}
          isLoading={isLoading}
          onEdit={handleEdit}
          onView={handleView}
        />
      </div>
      <DonorFormDialog
        onOpenChange={handleFormOpenChange}
        open={formOpen}
        party={editing}
      />
      <DonorDetailSheet
        canManage={canManage}
        onEdit={handleEdit}
        onOpenChange={handleDetailOpenChange}
        open={viewing !== null}
        party={viewing}
      />
    </div>
  );
}
