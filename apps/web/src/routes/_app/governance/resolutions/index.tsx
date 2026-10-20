import { Archive02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { env } from "@pi-dash/env/web";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_TEMPLATES,
  type ResolutionStatus,
  resolutionStatusValues,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { useCompactTable } from "@/components/data-table/data-table-compact";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { selectField } from "@/components/data-table/filter-fields";
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
  // A calendar item opens the new-circular form with its annual-pack template.
  validateSearch: z.object({
    template: z.enum(resolutionTemplateKeyValues).optional(),
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

interface ResolutionRow {
  /** Issued: the response deadline; decided: the decision date. */
  date: string | null;
  historical: boolean;
  id: string;
  number: string | null;
  objected: number;
  responses: number;
  signed: number;
  status: ResolutionStatus;
  templateTitle: string;
  title: string;
  /** Issued, and the signed-in trustee hasn't responded yet. */
  waitingForMe: boolean;
}

const WAITING_FOR_ME = {
  path: "response",
  value: "waiting-for-me",
} as const;

const filterFields: FilterField[] = [
  selectField(
    "status",
    "Status",
    resolutionStatusValues.map((value) => ({
      label: RESOLUTION_STATUS_LABELS[value],
      value,
    }))
  ),
  selectField(WAITING_FOR_ME.path, "Response", [
    { label: "Waiting for you", value: WAITING_FOR_ME.value },
  ]),
];

function getFilterValue(row: ResolutionRow, path: string[]): unknown {
  switch (path[0]) {
    case "status":
      return row.status;
    case WAITING_FOR_ME.path:
      return row.waitingForMe ? WAITING_FOR_ME.value : null;
    default:
      return;
  }
}

function searchResolution(row: ResolutionRow, query: string): boolean {
  return [row.title, row.templateTitle, row.number ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function getRowId(row: ResolutionRow) {
  return row.id;
}

// A phone card has room for two lines of a long title; a table row has one.
function TitleCell({ row }: { row: ResolutionRow }) {
  const compact = useCompactTable();
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className={cn(
          "font-medium",
          compact ? "line-clamp-2 whitespace-normal" : "truncate"
        )}
      >
        {row.title}
      </span>
      <span className="text-muted-foreground truncate text-xs">
        {row.templateTitle}
        {row.historical ? " · recorded from paper" : ""}
      </span>
    </span>
  );
}

// Phone cards leave out facts a row doesn't have yet instead of a bare dash.
function DateCell({ row }: { row: ResolutionRow }) {
  const compact = useCompactTable();
  if (row.status === "draft") {
    return compact ? null : "—";
  }
  return row.status === "issued"
    ? `Respond by ${formatIso(row.date)}`
    : formatIso(row.date);
}

function ResponsesCell({ row }: { row: ResolutionRow }) {
  const compact = useCompactTable();
  const { objected, responses, signed } = row;
  if (responses === 0 && compact) {
    return null;
  }
  return (
    <span className="text-muted-foreground truncate">
      {responses > 0
        ? `${signed} signed${objected ? `, ${objected} objected` : ""} of ${responses}`
        : "—"}
    </span>
  );
}

const SKELETON_TITLE = <Skeleton className="h-5 w-56" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-28" />;
const SKELETON_BADGE = <Skeleton className="h-5.5 w-16" />;

const columns: DataGridColumnDef<ResolutionRow>[] = [
  {
    accessorFn: (row) => row.title,
    cell: ({ row }) => <TitleCell row={row.original} />,
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Resolution"
        visibility={true}
      />
    ),
    id: "title",
    meta: {
      compact: "primary",
      headerTitle: "Resolution",
      kind: "text",
      skeleton: SKELETON_TITLE,
    },
    size: 320,
  },
  {
    accessorFn: (row) => row.status,
    cell: ({ row }) => <ResolutionStatusBadge status={row.original.status} />,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Status" visibility={true} />
    ),
    id: "status",
    meta: {
      compact: "primary",
      headerTitle: "Status",
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 120,
  },
  {
    accessorFn: (row) => row.number ?? "",
    cell: ({ row }) => row.original.number ?? "—",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Number" visibility={true} />
    ),
    id: "number",
    meta: { headerTitle: "Number", kind: "id", skeleton: SKELETON_TEXT },
    size: 170,
  },
  {
    accessorFn: (row) => row.signed,
    cell: ({ row }) => <ResponsesCell row={row.original} />,
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Responses"
        visibility={true}
      />
    ),
    id: "responses",
    meta: {
      compact: "primary",
      headerTitle: "Responses",
      skeleton: SKELETON_TEXT,
    },
    size: 200,
  },
  {
    accessorFn: (row) => row.date ?? "",
    cell: ({ row }) => <DateCell row={row.original} />,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Date" visibility={true} />
    ),
    id: "date",
    meta: {
      compact: "primary",
      headerTitle: "Date",
      kind: "date",
      skeleton: SKELETON_TEXT,
    },
    size: 190,
  },
];

function ResolutionsPage() {
  const { hasPermission, user } = useApp();
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
  const { template: startTemplate } = Route.useSearch();
  const [creating, setCreating] = useState<string | null>(() =>
    startTemplate && canManage ? uuidv7() : null
  );
  const startKey = startTemplate ?? "ordinary";
  const [recording, setRecording] = useState(false);

  const openCreate = useEventCallback(() => setCreating(uuidv7()));
  const handleCreated = useEventCallback((id: string) => {
    setCreating(null);
    navigate({
      params: { resolutionId: id },
      to: "/governance/resolutions/$resolutionId",
    });
  });

  const data: ResolutionRow[] = [...rows]
    .sort(openFirstThenRecent)
    .map((row) => {
      const responses = row.responses ?? [];
      const status = row.status ?? "draft";
      return {
        date: epochToIso(
          (status === "issued" ? row.circular?.responseDueOn : row.decidedOn) ??
            null
        ),
        historical: row.historical ?? false,
        id: row.id,
        number: row.number ?? null,
        objected: responses.filter((r) => r.response === "objection").length,
        responses: responses.length,
        signed: responses.filter((r) => r.signatureId).length,
        status,
        templateTitle: RESOLUTION_TEMPLATES[row.templateKey].title,
        title: row.title,
        waitingForMe:
          status === "issued" &&
          responses.some(
            (r) =>
              r.userId === user.id &&
              r.response === "pending" &&
              !r.conflictDeclared
          ),
      };
    });
  const openResolution = useEventCallback((row: ResolutionRow) =>
    navigate({
      params: { resolutionId: row.id },
      to: "/governance/resolutions/$resolutionId",
    })
  );

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
        <DataTableWrapper
          columns={columns}
          compactOnMobile
          data={data}
          emptyMessage={
            data.length > 0
              ? "No resolutions match."
              : canSee
                ? "No resolutions yet."
                : "No circulars have been sent to you."
          }
          filter={{
            attentionViews: [
              {
                count: data.filter((row) => row.waitingForMe).length,
                id: "waiting-for-me",
                label: "Waiting for you",
                rule: WAITING_FOR_ME,
              },
            ],
            fields: filterFields,
            getValue: getFilterValue,
            viewField: "status",
          }}
          getRowId={getRowId}
          isLoading={isLoading}
          onRowClick={openResolution}
          searchFn={searchResolution}
          searchPlaceholder="Search resolutions..."
          storageKey="governance_resolutions_table_state_v1"
          tableLayout={{
            columnsDraggable: true,
            columnsPinnable: true,
            columnsResizable: true,
            columnsVisibility: true,
          }}
        />
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
                body: RESOLUTION_TEMPLATES[startKey].text,
                effect: { type: "none" },
                templateKey: startKey,
                title:
                  startKey === "ordinary"
                    ? ""
                    : RESOLUTION_TEMPLATES[startKey].title,
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
