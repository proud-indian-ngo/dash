import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { GOVERNANCE_PAGE_PERMISSIONS } from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  isoToDate,
  type RegisterTrustee,
  todayIso,
  useGovernanceDocuments,
  useRegister,
} from "@/components/governance/register-data";
import { RegisterTable } from "@/components/governance/register-table";
import { RegisterWarnings } from "@/components/governance/register-warnings";
import { TrusteeDetailSheet } from "@/components/governance/trustee-detail-sheet";
import { TrusteeFormDialog } from "@/components/governance/trustee-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: TrusteeRegisterPage,
  head: () => ({
    meta: [{ title: `Trustee register | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.trustee.all(),
      abortController.signal
    );
  },
});

function TrusteeRegisterPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const [asOf, setAsOf] = useState(todayIso);
  const { inForce, input, isLoading, trustees } = useRegister(asOf);
  const { documents } = useGovernanceDocuments();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RegisterTrustee | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const viewing = viewingId
    ? (trustees.find((t) => t.id === viewingId) ?? null)
    : null;

  const openCreate = useEventCallback(() => {
    setEditing(null);
    setFormOpen(true);
  });
  const handleEdit = useEventCallback((trustee: RegisterTrustee) => {
    setEditing(trustee);
    setFormOpen(true);
  });
  const handleView = useEventCallback((trustee: RegisterTrustee) =>
    setViewingId(trustee.id)
  );
  const handleDetailOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      setViewingId(null);
    }
  });
  const handleSaved = useEventCallback((trusteeId: string) => {
    setDetailsVersion((n) => n + 1);
    if (!viewingId) {
      setViewingId(trusteeId);
    }
  });
  const handleFormOpenChange = useEventCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setEditing(null);
    }
  });
  const handleAsOf = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.value && isoToDate(event.target.value)) {
        setAsOf(event.target.value);
      }
    }
  );
  const resetAsOf = useEventCallback(() => setAsOf(todayIso()));
  const isToday = asOf === todayIso();

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
              Add trustee
            </Button>
          ) : null
        }
        description="Who is a trustee, in which offices, and on what evidence, on any date since the deed was registered."
        title="Trustee register"
      />
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-as-of">Board on</Label>
          <Input
            className="w-44"
            id="register-as-of"
            max="2100-12-31"
            min="2019-03-16"
            onChange={handleAsOf}
            type="date"
            value={asOf}
          />
        </div>
        {isToday ? null : (
          <Button onClick={resetAsOf} type="button" variant="ghost">
            Back to today
          </Button>
        )}
        {inForce ? (
          <p className="text-muted-foreground pb-2 text-sm">
            Rules: deed version {inForce.number}
          </p>
        ) : null}
      </div>
      <div className="mt-4">
        <RegisterWarnings input={input} on={asOf} />
      </div>
      <div className="mt-6">
        <RegisterTable
          input={input}
          isLoading={isLoading}
          on={asOf}
          onView={handleView}
        />
      </div>
      <TrusteeFormDialog
        onOpenChange={handleFormOpenChange}
        onSaved={handleSaved}
        open={formOpen}
        trustee={editing}
      />
      <TrusteeDetailSheet
        canManage={canManage}
        documents={documents}
        onEdit={handleEdit}
        onOpenChange={handleDetailOpenChange}
        open={viewing !== null}
        trustee={viewing}
        version={detailsVersion}
      />
    </div>
  );
}
