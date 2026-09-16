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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { formatINR } from "@/lib/form-schemas";
import { getKalakritiInventoryPhotoUrl } from "@/lib/kalakriti-inventory-upload";

import type { MovementAction } from "./inventory-movement-dialog";
import type { InventoryItem } from "./inventory-types";

const filterFields: FilterField[] = [
  { id: "name", label: "Name", type: "text" },
  { id: "status", label: "Status", type: "text" },
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
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
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onHistory(item)}>
                  History
                </DropdownMenuItem>
                {canManage && !item.archivedAt ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => onMovement(item, "purchase")}
                    >
                      Purchase
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onMovement(item, "adjustment")}
                    >
                      Adjust stock
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      Edit item
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={item.quantity !== 0}
                      onClick={() => onArchive(item)}
                      variant="destructive"
                    >
                      Archive item
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canManage && item.archivedAt ? (
                  <DropdownMenuItem onClick={() => onRestore(item)}>
                    Restore item
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
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
            : row.name,
      }}
    />
  );
}
