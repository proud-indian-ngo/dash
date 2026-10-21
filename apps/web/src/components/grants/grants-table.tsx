import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { type GrantStatus, grantStatusValues } from "@pi-dash/shared/constants";
import { GRANT_STATUS_LABELS } from "@pi-dash/shared/grants";
import { formatPaise } from "@pi-dash/shared/money";
import { useNavigate } from "@tanstack/react-router";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import { formatReceivedOn } from "@/components/income/income-date";
import { StatusBadge } from "@/components/shared/status-badge";

export interface GrantRow {
  endsOn: number;
  grantor: string;
  id: string;
  programmeId: string;
  programmeName: string;
  projectName: string;
  /** Null while the figures load. */
  receivedPaise: number | null;
  sanctionedPaise: number;
  spentPaise: number | null;
  startsOn: number;
  status: GrantStatus;
  title: string;
}

const SKELETON_TEXT = <Skeleton className="h-5 w-32" />;
const SKELETON_AMOUNT = <Skeleton className="h-5 w-20" />;

function getFilterValue(row: GrantRow, path: string[]) {
  const [key] = path;
  if (key === "status") {
    return row.status;
  }
  if (key === "programme") {
    return row.programmeId;
  }
  return;
}

function searchGrant(row: GrantRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [row.title, row.grantor, row.projectName, row.programmeName]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

function amountColumn(
  id: string,
  title: string,
  get: (row: GrantRow) => number | null,
  danger?: (row: GrantRow) => boolean
): DataGridColumnDef<GrantRow> {
  return {
    accessorFn: (row) => get(row) ?? 0,
    cell: ({ row }) => {
      const value = get(row.original);
      if (value === null) {
        return SKELETON_AMOUNT;
      }
      return (
        <span className={danger?.(row.original) ? "text-destructive" : ""}>
          {formatPaise(value)}
        </span>
      );
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title={title} visibility={true} />
    ),
    id,
    meta: {
      cellClassName: "text-right",
      headerTitle: title,
      kind: "amount",
      skeleton: SKELETON_AMOUNT,
    },
    size: 130,
  };
}

const unspentOf = (row: GrantRow) =>
  row.receivedPaise === null || row.spentPaise === null
    ? null
    : row.receivedPaise - row.spentPaise;

/** Finance → Grants: one row per agreement, money to date from the books. */
export function GrantsTable({
  data,
  isLoading,
}: {
  data: GrantRow[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const getRowId = useEventCallback((row: GrantRow) => row.id);
  const open = useEventCallback((row: GrantRow) => {
    navigate({ params: { id: row.id }, to: "/finance/grants/$id" });
  });
  const filterFields: FilterField[] = [
    selectField(
      "status",
      "Status",
      grantStatusValues.map((value) => ({
        label: GRANT_STATUS_LABELS[value],
        value,
      }))
    ),
    selectField(
      "programme",
      "Programme",
      optionsFromRows(
        data,
        (row) => row.programmeId,
        (row) => row.programmeName
      )
    ),
  ];
  const columns: DataGridColumnDef<GrantRow>[] = [
    {
      accessorFn: (row) => row.title,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Grant" visibility={true} />
      ),
      id: "title",
      meta: {
        compact: "primary",
        headerTitle: "Grant",
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      size: 220,
    },
    {
      accessorFn: (row) => row.grantor,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Grantor"
          visibility={true}
        />
      ),
      id: "grantor",
      meta: {
        compact: "primary",
        headerTitle: "Grantor",
        icon: COLUMN_ICONS.donor,
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      size: 180,
    },
    {
      accessorFn: (row) => `${row.projectName} ${row.programmeName}`,
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{row.original.projectName}</span>
          <span className="text-muted-foreground truncate text-xs">
            {row.original.programmeName}
          </span>
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Project"
          visibility={true}
        />
      ),
      id: "project",
      meta: {
        headerTitle: "Project",
        icon: COLUMN_ICONS.programme,
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.startsOn,
      cell: ({ row }) =>
        `${formatReceivedOn(row.original.startsOn)} – ${formatReceivedOn(row.original.endsOn)}`,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Period"
          visibility={true}
        />
      ),
      id: "period",
      meta: { headerTitle: "Period", kind: "date", skeleton: SKELETON_TEXT },
      size: 210,
    },
    amountColumn("sanctioned", "Sanctioned", (row) => row.sanctionedPaise),
    amountColumn("received", "Received", (row) => row.receivedPaise),
    amountColumn("spent", "Spent", (row) => row.spentPaise),
    amountColumn("unspent", "Unspent", unspentOf, (row) => {
      const unspent = unspentOf(row);
      return unspent !== null && unspent < 0;
    }),
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => (
        <StatusBadge
          tone={row.original.status === "active" ? "success" : "neutral"}
        >
          {GRANT_STATUS_LABELS[row.original.status]}
        </StatusBadge>
      ),
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
        kind: "status",
        skeleton: SKELETON_TEXT,
      },
      size: 110,
    },
  ];

  return (
    <DataTableWrapper<GrantRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No grants match."
      filter={{
        fields: filterFields,
        getValue: getFilterValue,
        queryKey: "grantFilters",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={open}
      searchFn={searchGrant}
      searchPlaceholder="Search grants..."
      searchQueryKey="grantSearch"
      storageKey="grants_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
