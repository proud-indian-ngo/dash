import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
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

import type { AgeCategoryFormValue } from "./age-category-form-dialog";

const SKELETON_NAME = <Skeleton className="h-5 w-28" />;
const SKELETON_RANGE = <Skeleton className="h-5 w-20" />;
const SKELETON_LIMIT = <Skeleton className="h-5 w-12" />;
const SKELETON_ACTIONS = <Skeleton className="mx-auto size-8" />;

function RowActions({
  category,
  onDelete,
  onEdit,
}: {
  category: AgeCategoryFormValue;
  onDelete: (category: AgeCategoryFormValue) => void;
  onEdit: (category: AgeCategoryFormValue) => void;
}) {
  const stopRowClick = useEventCallback(
    (event: { stopPropagation: () => void }) => event.stopPropagation()
  );
  const handleEdit = useEventCallback(() => onEdit(category));
  const handleDelete = useEventCallback(() => onDelete(category));

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
        <DropdownMenuItem onClick={handleEdit}>Edit Category</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} variant="destructive">
          Delete Category
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function searchAgeCategory(
  category: AgeCategoryFormValue,
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    category.name,
    `${category.minimumAge}-${category.maximumAge}`,
    category.maleStudentLimit,
    category.femaleStudentLimit,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function AgeCategoriesTable({
  canEdit,
  data,
  isLoading,
  onDelete,
  onEdit,
  toolbarActions,
}: {
  canEdit: boolean;
  data: AgeCategoryFormValue[];
  isLoading: boolean;
  onDelete: (category: AgeCategoryFormValue) => void;
  onEdit: (category: AgeCategoryFormValue) => void;
  toolbarActions?: ReactNode;
}) {
  const columns: DataGridColumnDef<AgeCategoryFormValue>[] = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <span className="text-sm font-medium" data-testid="row-title">
          {row.original.name}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 180,
    },
    {
      accessorFn: (category) => `${category.minimumAge}-${category.maximumAge}`,
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.minimumAge}-{row.original.maximumAge} years
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age range"
          visibility={true}
        />
      ),
      id: "ageRange",
      meta: { headerTitle: "Age range", skeleton: SKELETON_RANGE },
      size: 130,
    },
    {
      accessorKey: "maleStudentLimit",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Male / Center"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Male / Center", skeleton: SKELETON_LIMIT },
      size: 130,
    },
    {
      accessorKey: "femaleStudentLimit",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Female / Center"
          visibility={true}
        />
      ),
      meta: { headerTitle: "Female / Center", skeleton: SKELETON_LIMIT },
      size: 140,
    },
    {
      accessorKey: "maxTotalCompetitions",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Competitions / Student"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Competitions / Student",
        skeleton: SKELETON_LIMIT,
      },
      size: 180,
    },
    {
      accessorKey: "maxCompetitionsPerCategory",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Per Competition Category"
          visibility={true}
        />
      ),
      meta: {
        headerTitle: "Per Competition Category",
        skeleton: SKELETON_LIMIT,
      },
      size: 190,
    },
  ];

  if (canEdit) {
    columns.push({
      cell: ({ row }) => (
        <RowActions
          category={row.original}
          onDelete={onDelete}
          onEdit={onEdit}
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
    });
  }

  const getRowId = useEventCallback(
    (category: AgeCategoryFormValue) => category.id
  );
  const handleRowClick = useEventCallback((category: AgeCategoryFormValue) => {
    if (canEdit) {
      onEdit(category);
    }
  });

  return (
    <DataTableWrapper<AgeCategoryFormValue>
      columns={columns}
      data={data}
      emptyMessage="No Age Categories configured."
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={canEdit ? handleRowClick : undefined}
      searchFn={searchAgeCategory}
      searchPlaceholder="Search Age Categories..."
      storageKey="kalakriti_age_categories_table_state_v1"
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
