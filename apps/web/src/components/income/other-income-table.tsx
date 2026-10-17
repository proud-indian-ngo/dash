import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type OtherIncomeKind,
  otherIncomeKindValues,
} from "@pi-dash/shared/constants";
import { OTHER_INCOME_KIND_LABELS } from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { Tag } from "@/components/shared/status-badge";

import { formatReceivedOn } from "./contribution-detail-sheet";
import type { OtherIncomeRow } from "./income-types";

const SKELETON_DATE = <Skeleton className="h-5 w-24" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-40" />;

const FILTER_FIELDS: FilterField[] = [
  selectField(
    "kind",
    "Kind",
    otherIncomeKindValues.map((value) => ({
      label: OTHER_INCOME_KIND_LABELS[value],
      value,
    }))
  ),
  dateField("receivedOn", "Received on"),
];

function getOtherIncomeFilterValue(row: OtherIncomeRow, path: string[]) {
  const [key] = path;
  if (key === "kind") {
    return row.kind;
  }
  if (key === "receivedOn") {
    return row.receivedOn;
  }
  return;
}

function searchOtherIncome(row: OtherIncomeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [row.description ?? "", row.orgAccount?.name ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

function RowActions({
  onDelete,
  onEdit,
  row,
}: {
  onDelete: (row: OtherIncomeRow) => void;
  onEdit: (row: OtherIncomeRow) => void;
  row: OtherIncomeRow;
}) {
  const stopPropagation = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  return (
    <ResponsiveActionMenu
      actions={[
        {
          icon: Edit02Icon,
          id: "edit",
          label: "Edit",
          onSelect: () => onEdit(row),
        },
        {
          destructive: true,
          group: "destructive",
          icon: Delete02Icon,
          id: "delete",
          label: "Delete",
          onSelect: () => onDelete(row),
        },
      ]}
      title="Income actions"
      trigger={<RowActionsButton onClick={stopPropagation} />}
    />
  );
}

export function OtherIncomeTable({
  canManage,
  data,
  isLoading,
  onDelete,
  onEdit,
}: {
  canManage: boolean;
  data: OtherIncomeRow[];
  isLoading: boolean;
  onDelete: (row: OtherIncomeRow) => void;
  onEdit: (row: OtherIncomeRow) => void;
}) {
  const getRowId = useEventCallback((row: OtherIncomeRow) => row.id);
  const columns: DataGridColumnDef<OtherIncomeRow>[] = [
    {
      accessorFn: (row) => row.receivedOn,
      cell: ({ row }) => formatReceivedOn(row.original.receivedOn),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Received On"
          visibility={true}
        />
      ),
      id: "receivedOn",
      meta: {
        headerTitle: "Received On",
        kind: "date",
        skeleton: SKELETON_DATE,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.kind,
      cell: ({ row }) => (
        <Tag>
          {OTHER_INCOME_KIND_LABELS[row.original.kind as OtherIncomeKind]}
        </Tag>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Kind" visibility={true} />
      ),
      id: "kind",
      meta: {
        compact: "primary",
        headerTitle: "Kind",
        skeleton: SKELETON_TEXT,
      },
      size: 140,
    },
    {
      accessorFn: (row) => row.amountPaise,
      cell: ({ row }) => formatPaise(row.original.amountPaise),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Amount"
          visibility={true}
        />
      ),
      id: "amount",
      meta: {
        compact: "trailing",
        headerTitle: "Amount",
        kind: "amount",
        skeleton: SKELETON_DATE,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.orgAccount?.name ?? "",
      cell: ({ row }) => row.original.orgAccount?.name ?? "—",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Account"
          visibility={true}
        />
      ),
      id: "account",
      meta: { headerTitle: "Account", skeleton: SKELETON_TEXT },
      size: 180,
    },
    {
      accessorFn: (row) => row.description ?? "",
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-sm">
          {row.original.description ?? "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Description"
          visibility={true}
        />
      ),
      id: "description",
      meta: { headerTitle: "Description", skeleton: SKELETON_TEXT },
      size: 260,
    },
    ...(canManage
      ? [
          {
            cell: ({ row }) => (
              <RowActions
                onDelete={onDelete}
                onEdit={onEdit}
                row={row.original}
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
              stopRowClick: true,
            },
            minSize: 52,
            size: 52,
          } satisfies DataGridColumnDef<OtherIncomeRow>,
        ]
      : []),
  ];

  return (
    <DataTableWrapper<OtherIncomeRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No income matches."
      filter={{
        fields: FILTER_FIELDS,
        getValue: getOtherIncomeFilterValue,
        queryKey: "otherFilters",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      searchFn={searchOtherIncome}
      searchPlaceholder="Search description or account..."
      searchQueryKey="otherSearch"
      storageKey="other_income_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      totals={["amount"]}
    />
  );
}
