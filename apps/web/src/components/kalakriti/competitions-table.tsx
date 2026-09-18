import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createCompetitionFilterFields,
  getCompetitionFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { COMPETITION_STATUS_LABELS } from "@/lib/kalakriti-competition-status";

import {
  type CompetitionTableRow,
  type ConfigurationDeletePayload,
  type ConfigurationStatePayload,
  formatConfigurationLabel,
  getCompetitionStatus,
} from "./competition-config-types";

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_CATEGORY = <Skeleton className="h-5 w-28" />;
const SKELETON_VALUE = <Skeleton className="h-5 w-20" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RowActions({
  canEdit,
  canManageCancellations,
  canManageStructure,
  competition,
  onDelete,
  onEdit,
  onSetState,
  onView,
  onDetails,
}: {
  canEdit: boolean;
  canManageCancellations: boolean;
  canManageStructure: boolean;
  competition: CompetitionTableRow;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (competition: CompetitionTableRow) => void;
  onDetails: (competition: CompetitionTableRow) => void;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(competition));
  const handleDetails = useEventCallback(() => onDetails(competition));
  const handleEdit = useEventCallback(() => onEdit(competition));
  const handleCancel = useEventCallback(() =>
    onSetState({
      action: competition.cancelledAt === null ? "Cancel" : "Restore",
      enabled: competition.cancelledAt === null,
      id: competition.id,
      kind: "competition_cancelled",
      name: competition.name,
    })
  );
  const handleRetire = useEventCallback(() =>
    onSetState({
      action: competition.retiredAt === null ? "Retire" : "Restore",
      enabled: competition.retiredAt === null,
      id: competition.id,
      kind: "competition_retired",
      name: competition.name,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({
      id: competition.id,
      kind: "competition",
      name: competition.name,
    })
  );

  return (
    <ResponsiveActionMenu
      title={`${competition.name} actions`}
      trigger={
        <Button
          aria-label={`Actions for ${competition.name}`}
          className="size-10 max-sm:size-11"
          data-testid="row-actions"
          onClick={stopRowClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={MoreVerticalIcon}
            strokeWidth={2}
          />
        </Button>
      }
      actions={[
        { id: "entries", label: "View Entries", onSelect: handleView },
        { id: "details", label: "View configuration", onSelect: handleDetails },
        canEdit && {
          id: "edit",
          label: "Edit Competition",
          onSelect: handleEdit,
        },
        canManageCancellations && {
          id: "cancel",
          label: `${competition.cancelledAt === null ? "Cancel" : "Restore"} Competition`,
          onSelect: handleCancel,
        },
        canManageStructure && {
          id: "retire",
          label: `${competition.retiredAt === null ? "Retire" : "Restore"} Competition`,
          onSelect: handleRetire,
        },
        canManageStructure && {
          id: "delete",
          label: "Delete Competition",
          onSelect: handleDelete,
          destructive: true,
        },
      ]}
    />
  );
}

function searchCompetition(
  competition: CompetitionTableRow,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    competition.name,
    competition.categoryName,
    competition.participationMode,
    competition.genderEligibility,
    competition.ageCategoryName,
    competition.venueName,
    formatConfigurationLabel(getCompetitionStatus(competition)),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function CompetitionsTable({
  canEdit,
  canManageCancellations,
  canManageStructure,
  data,
  isLoading,
  onDelete,
  onEdit,
  onSetState,
  onView,
  onDetails,
  toolbarActions,
}: {
  canEdit: boolean;
  canManageCancellations: boolean;
  canManageStructure: boolean;
  data: CompetitionTableRow[];
  isLoading: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (competition: CompetitionTableRow) => void;
  onDetails: (competition: CompetitionTableRow) => void;
  toolbarActions?: ReactNode;
}) {
  const filterFields = useMemo(
    () => createCompetitionFilterFields(data),
    [data]
  );
  const columns: DataGridColumnDef<CompetitionTableRow>[] = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" data-testid="row-title">
            {row.original.name}
          </span>
          {row.original.musicUploadEnabled ? (
            <Badge variant="outline">Music</Badge>
          ) : null}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Competition"
          visibility={true}
        />
      ),
      meta: {
        compact: "primary",
        headerTitle: "Competition",
        skeleton: SKELETON_NAME,
      },
      size: 210,
    },
    {
      accessorKey: "ageCategoryName",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Category"
          visibility={true}
        />
      ),
      id: "ageCategories",
      meta: { headerTitle: "Age Category", skeleton: SKELETON_VALUE },
      size: 190,
    },
    {
      accessorKey: "categoryName",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Category"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Category", skeleton: SKELETON_CATEGORY },
      size: 170,
    },
    {
      accessorKey: "entryCount",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.entryCount ?? "Checking"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Entries"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Entries", skeleton: SKELETON_VALUE },
      size: 100,
    },
    {
      accessorKey: "participantCount",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.participantCount ?? "Checking"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participants"
          visibility={true}
        />
      ),
      meta: {
        compact: "trailing",
        headerTitle: "Participants",
        skeleton: SKELETON_VALUE,
      },
      size: 120,
    },
    {
      accessorKey: "venueName",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Venue" visibility={true} />
      ),
      meta: { headerTitle: "Venue", skeleton: SKELETON_VALUE },
      size: 160,
    },
    {
      accessorKey: "scheduleLabel",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Schedule"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Schedule", skeleton: SKELETON_VALUE },
      size: 230,
    },
    {
      accessorKey: "participationMode",
      cell: ({ row }) => (
        <span className="text-sm capitalize">
          {formatConfigurationLabel(row.original.participationMode)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Format"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Format", skeleton: SKELETON_VALUE },
      size: 120,
    },
    {
      accessorKey: "genderEligibility",
      cell: ({ row }) => (
        <span className="text-sm capitalize">
          {formatConfigurationLabel(row.original.genderEligibility)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Eligibility"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Eligibility", skeleton: SKELETON_VALUE },
      size: 130,
    },
    {
      accessorFn: (competition) =>
        `${competition.minimumGroupSize}-${competition.maximumGroupSize}`,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.minimumGroupSize}-{row.original.maximumGroupSize}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Group size"
          visibility={true}
        />
      ),
      id: "groupSize",
      meta: { headerTitle: "Group size", skeleton: SKELETON_VALUE },
      size: 120,
    },
    {
      accessorFn: getCompetitionStatus,
      cell: ({ row }) => {
        const status = getCompetitionStatus(row.original);
        return (
          <Badge
            variant={
              status === "running" || status === "winner_assigned"
                ? "secondary"
                : "outline"
            }
          >
            {status === "checking"
              ? "Checking"
              : COMPETITION_STATUS_LABELS[status]}
          </Badge>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: {
        compact: "primary",
        headerTitle: "Status",
        skeleton: SKELETON_STATUS,
      },
      size: 110,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canEdit={canEdit}
          canManageCancellations={canManageCancellations}
          canManageStructure={canManageStructure}
          competition={row.original}
          onDelete={onDelete}
          onEdit={onEdit}
          onSetState={onSetState}
          onView={onView}
          onDetails={onDetails}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "px-1 text-center",
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      size: 52,
    },
  ];
  const getRowId = useEventCallback(
    (row: CompetitionTableRow) => row.divisionId ?? row.id
  );
  const handleRowClick = useEventCallback((row: CompetitionTableRow) =>
    onView(row)
  );

  return (
    <DataTableWrapper<CompetitionTableRow>
      defaultColumnVisibility={{
        participationMode: false,
        genderEligibility: false,
        groupSize: false,
      }}
      columns={columns}
      data={data}
      emptyMessage="No Competitions configured."
      compactOnMobile
      filter={{
        fields: filterFields,
        getValue: getCompetitionFilterValue,
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchCompetition}
      searchPlaceholder="Search Competitions..."
      storageKey="kalakriti_competitions_table_state_v4"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
