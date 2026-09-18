import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pi-dash/design-system/components/ui/dialog";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { formatINR } from "@/lib/form-schemas";
import { getKalakritiInventoryPhotoUrl } from "@/lib/kalakriti-inventory-upload";

import type { MovementAction } from "./inventory-movement-dialog";
import type { InventoryItem } from "./inventory-types";

const filterFields: FilterField[] = [
  { id: "name", label: "Name", type: "text" },
  { id: "status", label: "Status", type: "text" },
  { id: "quantity", label: "Quantity", type: "number" },
];

function searchItem(row: InventoryItem, query: string): boolean {
  return `${row.name} ${row.archivedAt ? "archived" : "active"}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function InventoryPhotoPreview({ item }: { item: InventoryItem }) {
  const src = getKalakritiInventoryPhotoUrl(item.id);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            aria-label={`Preview photo of ${item.name}`}
            className="size-9 shrink-0 p-0"
            size="icon"
            variant="ghost"
          >
            <img
              alt=""
              className="size-9 rounded object-cover"
              loading="lazy"
              src={src}
            />
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{item.name} photo</DialogTitle>
          <DialogDescription className="sr-only">
            Inventory item photo preview.
          </DialogDescription>
        </DialogHeader>
        <img
          alt={item.name}
          className="max-h-[75dvh] w-full object-contain"
          src={src}
        />
      </DialogContent>
    </Dialog>
  );
}

export function InventoryItemsTable({
  items,
  complete,
  canManage,
  onAdd,
  onEdit,
  onMovement,
  onHistory,
  onArchive,
  onRestore,
}: {
  items: readonly InventoryItem[];
  complete: boolean;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (item: InventoryItem) => void;
  onMovement: (item: InventoryItem, action: MovementAction) => void;
  onHistory: (item: InventoryItem) => void;
  onArchive: (item: InventoryItem) => void;
  onRestore: (item: InventoryItem) => void;
}) {
  const columns = useMemo<DataGridColumnDef<InventoryItem>[]>(
    () => [
      {
        id: "name",
        accessorFn: (item) => item.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Item"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.photoKey ? (
              <InventoryPhotoPreview item={row.original} />
            ) : null}
            <span>{row.original.name}</span>
          </div>
        ),
        meta: {
          compact: "primary",
          headerTitle: "Item",
          skeleton: <Skeleton className="h-5 w-36" />,
        },
        size: 240,
      },
      {
        id: "quantity",
        accessorFn: (item) => item.quantity,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="In stock"
            visibility={true}
          />
        ),
        cell: ({ row }) => row.original.quantity,
        meta: {
          compact: "trailing",
          headerTitle: "In stock",
          skeleton: <Skeleton className="h-5 w-12" />,
        },
        size: 120,
      },
      {
        id: "unitPricePaise",
        accessorFn: (item) => item.unitPricePaise ?? 0,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Unit price"
            visibility={true}
          />
        ),
        cell: ({ row }) => formatINR((row.original.unitPricePaise ?? 0) / 100),
        meta: {
          headerTitle: "Unit price",
          skeleton: <Skeleton className="h-5 w-20" />,
        },
        size: 140,
      },
      {
        id: "estimatedValue",
        accessorFn: (item) => item.quantity * (item.unitPricePaise ?? 0),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Estimated value"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          formatINR(
            (row.original.quantity * (row.original.unitPricePaise ?? 0)) / 100
          ),
        meta: {
          headerTitle: "Estimated value",
          skeleton: <Skeleton className="h-5 w-20" />,
        },
        size: 160,
      },
      {
        id: "status",
        accessorFn: (item) => (item.archivedAt ? "Archived" : "Active"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Status"
            visibility={true}
          />
        ),
        cell: ({ row }) => (row.original.archivedAt ? "Archived" : "Active"),
        meta: {
          compact: "primary",
          headerTitle: "Status",
          skeleton: <Skeleton className="h-5 w-16" />,
        },
        size: 120,
      },
      {
        id: "actions",
        enableResizing: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <ResponsiveActionMenu
              title={`${item.name} actions`}
              trigger={
                <Button
                  aria-label={`Actions for ${item.name}`}
                  data-testid="row-actions"
                  className="size-7"
                  size="icon"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    icon={MoreVerticalIcon}
                    className="size-4"
                    strokeWidth={2}
                  />
                </Button>
              }
              actions={[
                {
                  id: "history",
                  label: "History",
                  onSelect: () => onHistory(item),
                },
                canManage &&
                  !item.archivedAt && {
                    id: "purchase",
                    label: "Purchase",
                    onSelect: () => onMovement(item, "purchase"),
                  },
                canManage &&
                  !item.archivedAt && {
                    id: "adjust",
                    label: "Adjust stock",
                    onSelect: () => onMovement(item, "adjustment"),
                  },
                canManage &&
                  !item.archivedAt && {
                    id: "edit",
                    label: "Edit item",
                    onSelect: () => onEdit(item),
                  },
                canManage &&
                  !item.archivedAt && {
                    id: "archive",
                    label: "Archive item",
                    onSelect: () => onArchive(item),
                    disabled: item.quantity !== 0,
                    destructive: true,
                  },
                canManage &&
                  !!item.archivedAt && {
                    id: "restore",
                    label: "Restore item",
                    onSelect: () => onRestore(item),
                  },
              ]}
            />
          );
        },
        meta: {
          enableColumnOrdering: false,
          cellClassName: "text-center",
          headerTitle: "",
          skeleton: <Skeleton className="size-7" />,
        },
        size: 52,
      },
    ],
    [canManage, onEdit, onMovement, onHistory, onArchive, onRestore]
  );

  return (
    <DataTableWrapper
      columns={columns}
      data={[...items]}
      emptyMessage="No inventory items found."
      compactOnMobile
      getRowId={(row) => row.id}
      isLoading={items.length === 0 && !complete}
      searchFn={searchItem}
      storageKey="kalakriti_inventory_items_table_state_v1"
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      toolbarActions={
        canManage ? <Button onClick={onAdd}>Add item</Button> : undefined
      }
      filter={{
        fields: filterFields,
        getValue: (row, path) =>
          path[0] === "status"
            ? row.archivedAt
              ? "Archived"
              : "Active"
            : path[0] === "quantity"
              ? row.quantity
              : row.name,
      }}
    />
  );
}
