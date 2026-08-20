import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createCompetitionFilterFields,
  getCompetitionFilterValue,
} from "@/components/kalakriti/kalakriti-filters";
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
  canManageCancellations,
  canManageStructure,
  competition,
  onDelete,
  onEdit,
  onSetState,
  onView,
}: {
  canManageCancellations: boolean;
  canManageStructure: boolean;
  competition: CompetitionTableRow;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (competition: CompetitionTableRow) => void;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(competition));
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${competition.name}`}
            className="size-8"
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
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleView}>View details</DropdownMenuItem>
        {canManageCancellations || canManageStructure ? (
          <>
            {canManageStructure ? (
              <DropdownMenuItem onClick={handleEdit}>
                Edit Competition
              </DropdownMenuItem>
            ) : null}
            {canManageCancellations ? (
              <DropdownMenuItem onClick={handleCancel}>
                {competition.cancelledAt === null ? "Cancel" : "Restore"}{" "}
                Competition
              </DropdownMenuItem>
            ) : null}
            {canManageStructure ? (
              <>
                <DropdownMenuItem onClick={handleRetire}>
                  {competition.retiredAt === null ? "Retire" : "Restore"}{" "}
                  Competition
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} variant="destructive">
                  Delete Competition
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
    competition.divisions
      .map((division) => division.ageCategory?.name)
      .join(" "),
    getCompetitionStatus(competition),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function CompetitionsTable({
  canManageCancellations,
  canManageStructure,
  data,
  isLoading,
  onDelete,
  onEdit,
  onSetState,
  onView,
  toolbarActions,
}: {
  canManageCancellations: boolean;
  canManageStructure: boolean;
  data: CompetitionTableRow[];
  isLoading: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (competition: CompetitionTableRow) => void;
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
        <span className="font-medium text-sm" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Competition"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Competition", skeleton: SKELETON_NAME },
      size: 210,
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
        competition.divisions
          .flatMap((division) =>
            division.ageCategory ? [division.ageCategory.name] : []
          )
          .join(", "),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Categories"
          visibility={true}
        />
      ),
      id: "ageCategories",
      meta: { headerTitle: "Age Categories", skeleton: SKELETON_VALUE },
      size: 190,
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
            className="capitalize"
            variant={status === "active" ? "secondary" : "outline"}
          >
            {status}
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
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 110,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canManageCancellations={canManageCancellations}
          canManageStructure={canManageStructure}
          competition={row.original}
          onDelete={onDelete}
          onEdit={onEdit}
          onSetState={onSetState}
          onView={onView}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      size: 52,
    },
  ];
  const getRowId = useEventCallback((row: CompetitionTableRow) => row.id);
  const handleRowClick = useEventCallback((row: CompetitionTableRow) =>
    onView(row)
  );

  return (
    <DataTableWrapper<CompetitionTableRow>
      columns={columns}
      data={data}
      emptyMessage="No Competitions configured."
      filter={{
        fields: filterFields,
        getValue: getCompetitionFilterValue,
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchCompetition}
      searchPlaceholder="Search Competitions..."
      storageKey="kalakriti_competitions_table_state_v1"
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
