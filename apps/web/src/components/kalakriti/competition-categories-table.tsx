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
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import type {
  CompetitionCategoryTableRow,
  ConfigurationDeletePayload,
  ConfigurationStatePayload,
} from "./competition-config-types";

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_VALUE = <Skeleton className="h-5 w-20" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RowActions({
  canManage,
  category,
  onDelete,
  onEdit,
  onSetState,
  onView,
}: {
  canManage: boolean;
  category: CompetitionCategoryTableRow;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (category: CompetitionCategoryTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (category: CompetitionCategoryTableRow) => void;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(category));
  const handleEdit = useEventCallback(() => onEdit(category));
  const handleRetire = useEventCallback(() =>
    onSetState({
      action: category.retiredAt === null ? "Retire" : "Restore",
      enabled: category.retiredAt === null,
      id: category.id,
      kind: "category_retired",
      name: category.name,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id: category.id, kind: "category", name: category.name })
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${category.name}`}
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
        {canManage ? (
          <>
            <DropdownMenuItem onClick={handleEdit}>
              Edit Category
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRetire}>
              {category.retiredAt === null ? "Retire" : "Restore"} Category
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} variant="destructive">
              Delete Category
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchCategory(
  category: CompetitionCategoryTableRow,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [category.name, category.retiredAt === null ? "active" : "retired"]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function CompetitionCategoriesTable({
  canManage,
  data,
  isLoading,
  onDelete,
  onEdit,
  onSetState,
  onView,
  toolbarActions,
}: {
  canManage: boolean;
  data: CompetitionCategoryTableRow[];
  isLoading: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (category: CompetitionCategoryTableRow) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  onView: (category: CompetitionCategoryTableRow) => void;
  toolbarActions?: ReactNode;
}) {
  const columns: DataGridColumnDef<CompetitionCategoryTableRow>[] = [
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
          title="Category"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Category", skeleton: SKELETON_NAME },
      size: 240,
    },
    {
      accessorKey: "sortOrder",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Display order"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Display order", skeleton: SKELETON_VALUE },
      size: 130,
    },
    {
      accessorKey: "competitionCount",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Competitions"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Competitions", skeleton: SKELETON_VALUE },
      size: 130,
    },
    {
      accessorFn: (category) =>
        category.retiredAt === null ? "active" : "retired",
      cell: ({ row }) => {
        const status = row.original.retiredAt === null ? "Active" : "Retired";
        return (
          <Badge variant={status === "Active" ? "secondary" : "outline"}>
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
          canManage={canManage}
          category={row.original}
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
  const getRowId = useEventCallback(
    (row: CompetitionCategoryTableRow) => row.id
  );
  const handleRowClick = useEventCallback((row: CompetitionCategoryTableRow) =>
    onView(row)
  );

  return (
    <DataTableWrapper<CompetitionCategoryTableRow>
      columns={columns}
      data={data}
      emptyMessage="No Competition Categories configured."
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={handleRowClick}
      searchFn={searchCategory}
      searchPlaceholder="Search Competition Categories..."
      storageKey="kalakriti_competition_categories_table_state_v1"
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
