import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { KALAKRITI_RESPONSIBILITY_LABELS } from "@pi-dash/shared/kalakriti";
import { KALAKRITI_INVENTORY_LABELS } from "@pi-dash/shared/kalakriti-inventory";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField } from "@/components/data-table/filter-fields";

import type { InventoryTransaction } from "./inventory-types";

const filterFields: FilterField[] = [
  { id: "item", label: "Item", type: "text" },
  { id: "type", label: "Type", type: "text" },
  { id: "volunteer", label: "Volunteer", type: "text" },
  { id: "competition", label: "Competition / role", type: "text" },
  dateField("createdAt", "Recorded at"),
];

function getValue(
  row: InventoryTransaction,
  key: string
): string | number | null | undefined {
  switch (key) {
    case "item":
      return row.item?.name;
    case "type":
      return KALAKRITI_INVENTORY_LABELS[row.type];
    case "volunteer":
      return row.volunteer?.snapshotName ?? row.volunteer?.user?.name;
    case "competition":
      return (
        row.competition?.name ??
        (row.responsibility
          ? KALAKRITI_RESPONSIBILITY_LABELS[row.responsibility]
          : undefined)
      );
    case "notes":
      return row.notes;
    case "actor":
      return row.actor?.name;
    case "createdAt":
      return row.createdAt;
    default:
      return undefined;
  }
}

function searchTransaction(row: InventoryTransaction, query: string): boolean {
  return ["item", "type", "volunteer", "competition", "notes", "actor"]
    .map((key) => getValue(row, key) ?? "")
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

export function InventoryTransactionsTable({
  transactions,
  complete,
  storageKey = "kalakriti_inventory_transactions_table_state_v1",
}: {
  transactions: readonly InventoryTransaction[];
  complete: boolean;
  storageKey?: string;
}) {
  const columns = useMemo<DataGridColumnDef<InventoryTransaction>[]>(
    () => [
      {
        id: "createdAt",
        accessorFn: (row) => row.createdAt,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Recorded at"
            visibility={true}
          />
        ),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
        meta: {
          headerTitle: "Recorded at",
          skeleton: <Skeleton className="h-5 w-32" />,
        },
        size: 185,
      },
      ...(
        ["item", "type", "volunteer", "competition", "notes", "actor"] as const
      ).map((key): DataGridColumnDef<InventoryTransaction> => ({
        id: key,
        accessorFn: (row) => getValue(row, key),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={
              {
                item: "Item",
                type: "Type",
                volunteer: "Volunteer",
                competition: "Competition / role",
                notes: "Purpose / notes",
                actor: "Recorded by",
              }[key]
            }
            visibility={true}
          />
        ),
        cell: ({ row }) => getValue(row.original, key) || "—",
        meta: {
          ...(key === "item" || key === "type"
            ? { compact: "primary" as const }
            : {}),
          headerTitle: {
            item: "Item",
            type: "Type",
            volunteer: "Volunteer",
            competition: "Competition / role",
            notes: "Purpose / notes",
            actor: "Recorded by",
          }[key],
          skeleton: <Skeleton className="h-5 w-24" />,
        },
        size: key === "notes" ? 220 : 160,
      })),
      {
        id: "quantity",
        accessorFn: (row) => row.quantity,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Change"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          row.original.quantity > 0
            ? `+${row.original.quantity}`
            : row.original.quantity,
        meta: {
          headerTitle: "Change",
          skeleton: <Skeleton className="h-5 w-12" />,
        },
        size: 90,
      },
      {
        id: "quantityAfter",
        accessorFn: (row) => row.quantityAfter,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Balance"
            visibility={true}
          />
        ),
        cell: ({ row }) => row.original.quantityAfter,
        meta: {
          headerTitle: "Balance",
          skeleton: <Skeleton className="h-5 w-12" />,
        },
        size: 95,
      },
    ],
    []
  );
  return (
    <DataTableWrapper
      columns={columns}
      data={[...transactions]}
      emptyMessage="No stock transactions found."
      compactOnMobile
      getRowId={(row) => row.id}
      isLoading={transactions.length === 0 && !complete}
      searchFn={searchTransaction}
      storageKey={storageKey}
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      filter={{
        fields: filterFields,
        getValue: (row, path) => getValue(row, path[0] ?? ""),
      }}
    />
  );
}
