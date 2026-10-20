import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  boardOn,
  GOVERNANCE_PAGE_PERMISSIONS,
  quorumFor,
} from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";

import { quorumText } from "@/components/governance/deed-rules";
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
import { StatsCards } from "@/components/stats/stats-cards";
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
  const today = todayIso();
  const [on, setOn] = useQueryState("on", parseAsString);
  const asOf = on && isoToDate(on) ? on : today;
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
  const handleDateChange = useEventCallback((iso: string | null) =>
    setOn(iso === today ? null : iso)
  );
  const board = boardOn(input, asOf);
  const quorum = quorumFor(input.rules, board.length);
  const { maxTrustees, minTrustees } = input.rules;
  const outOfRange = board.length < minTrustees || board.length > maxTrustees;

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
      <StatsCards
        className="mt-6"
        isLoading={isLoading}
        items={[
          {
            description: `of ${minTrustees} to ${maxTrustees}`,
            hint: "The deed in force on this date sets the board's smallest and largest size.",
            label: "Trustees",
            tone: outOfRange ? "danger" : "neutral",
            value: board.length,
          },
          {
            description: "present",
            hint: `A meeting is quorate with ${quorumText(input.rules)}.`,
            label: "Quorum",
            tone: quorum > board.length ? "warning" : "neutral",
            value: quorum,
          },
          {
            href: "/governance/deed",
            label: "Deed version",
            value: inForce?.number ?? "—",
          },
        ]}
      />
      <div className="mt-4 empty:hidden">
        <RegisterWarnings input={input} on={asOf} />
      </div>
      <div className="mt-4">
        <RegisterTable
          input={input}
          isLoading={isLoading}
          isToday={asOf === today}
          on={asOf}
          onDateChange={handleDateChange}
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
