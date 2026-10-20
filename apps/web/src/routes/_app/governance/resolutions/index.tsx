import { Archive02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { RESOLUTION_TEMPLATES } from "@pi-dash/shared/resolutions";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { HistoricalResolutionDialog } from "@/components/governance/historical-resolution-dialog";
import {
  epochToIso,
  formatIso,
  todayIso,
  useRegister,
} from "@/components/governance/register-data";
import {
  draftValuesFrom,
  ResolutionDraftForm,
} from "@/components/governance/resolution-draft-form";
import { ResolutionStatusBadge } from "@/components/governance/resolution-status";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";

export const Route = createFileRoute("/_app/governance/resolutions/")({
  component: ResolutionsPage,
  head: () => ({
    meta: [{ title: `Resolutions | ${env.VITE_APP_NAME}` }],
  }),
});

const STATUS_ORDER = {
  draft: 1,
  failed: 3,
  issued: 0,
  passed: 2,
  withdrawn: 3,
} as const;

/** Issued circulars first, then drafts, then decided ones; newest first within each. */
function openFirstThenRecent(
  a: { status: keyof typeof STATUS_ORDER | null; updatedAt: number | null },
  b: { status: keyof typeof STATUS_ORDER | null; updatedAt: number | null }
) {
  const byStatus =
    STATUS_ORDER[a.status ?? "draft"] - STATUS_ORDER[b.status ?? "draft"];
  return byStatus === 0 ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0) : byStatus;
}

function ResolutionsPage() {
  const { hasPermission } = useApp();
  const canSee =
    hasPermission("governance.view") || hasPermission("governance.manage");
  const canManage = hasPermission("governance.manage");
  const [all, allResult] = useQuery(queries.resolution.all());
  const [mine, mineResult] = useQuery(queries.resolution.mine());
  const rows = canSee ? all : mine;
  const isLoading =
    rows.length === 0 &&
    (canSee ? allResult.type : mineResult.type) !== "complete";
  const { trustees } = useRegister(todayIso());
  const navigate = useNavigate();
  const [creating, setCreating] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const openCreate = useEventCallback(() => setCreating(uuidv7()));
  const handleCreated = useEventCallback((id: string) => {
    setCreating(null);
    navigate({
      params: { resolutionId: id },
      to: "/governance/resolutions/$resolutionId",
    });
  });

  const sorted = [...rows].sort(openFirstThenRecent);

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <>
              <Button onClick={openCreate} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                New circular
              </Button>
              <PageHeaderMenu
                actions={[
                  {
                    icon: Archive02Icon,
                    id: "historical",
                    label: "Record a past resolution",
                    onSelect: () => setRecording(true),
                  },
                ]}
                title="Resolution actions"
              />
            </>
          ) : null
        }
        description="Decisions of the Board by circulation (clause 4.18): drafted, issued by the Managing Trustee, signed or objected to by each trustee, and numbered when they pass."
        title="Resolutions"
      />
      <div className="mt-6">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}
        {!isLoading && sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {canSee
              ? "No resolutions yet."
              : "No circulars have been sent to you."}
          </p>
        ) : null}
        {sorted.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resolution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => {
                  const responses = row.responses ?? [];
                  const signed = responses.filter((r) => r.signatureId).length;
                  const objected = responses.filter(
                    (r) => r.response === "objection"
                  ).length;
                  const date =
                    row.status === "issued"
                      ? `Respond by ${formatIso(epochToIso(row.responseDueOn ?? null))}`
                      : formatIso(epochToIso(row.decidedOn ?? null));
                  return (
                    <TableRow
                      className="cursor-pointer"
                      key={row.id}
                      onClick={() =>
                        navigate({
                          params: { resolutionId: row.id },
                          to: "/governance/resolutions/$resolutionId",
                        })
                      }
                    >
                      <TableCell>
                        <span className="flex flex-col">
                          <span className="font-medium">{row.title}</span>
                          <span className="text-muted-foreground text-xs">
                            {RESOLUTION_TEMPLATES[row.templateKey].title}
                            {row.historical ? " · recorded from paper" : ""}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <ResolutionStatusBadge status={row.status ?? "draft"} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.number ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {responses.length > 0
                          ? `${signed} signed${objected ? `, ${objected} objected` : ""} of ${responses.length}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.status === "draft" ? "—" : date}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setCreating(null);
          }
        }}
        open={creating !== null}
      >
        <DialogContent className="sm:max-w-(--dialog-lg)">
          <DialogHeader>
            <DialogTitle>New circular</DialogTitle>
            <DialogDescription>
              Draft it here; the Managing Trustee issues it when it's ready.
            </DialogDescription>
          </DialogHeader>
          {creating ? (
            <ResolutionDraftForm
              draftId={creating}
              initial={draftValuesFrom({
                body: RESOLUTION_TEMPLATES.ordinary.text,
                effect: { type: "none" },
                templateKey: "ordinary",
                title: "",
              })}
              mode="create"
              onCancel={() => setCreating(null)}
              onSaved={handleCreated}
              trustees={trustees}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <HistoricalResolutionDialog
        onOpenChange={setRecording}
        open={recording}
      />
    </div>
  );
}
