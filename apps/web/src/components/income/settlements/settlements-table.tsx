import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type GatewaySettlementStatus,
  gatewaySettlementStatusValues,
} from "@pi-dash/shared/constants";
import { formatPaise } from "@pi-dash/shared/money";
import {
  isUnlinkedLine,
  settlementOwnFeePaise,
} from "@pi-dash/shared/settlements";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { formatReceivedOn } from "@/components/income/contribution-detail-sheet";
import { StatusBadge, Tag } from "@/components/shared/status-badge";

import {
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_TONES,
  type SettlementRow,
  shortId,
} from "./settlement-types";

const SKELETON_TEXT = <Skeleton className="h-5 w-28" />;
const SKELETON_NUMBER = <Skeleton className="h-5 w-16" />;

const FILTER_FIELDS: FilterField[] = [
  selectField(
    "status",
    "Status",
    gatewaySettlementStatusValues.map((value) => ({
      label: SETTLEMENT_STATUS_LABELS[value],
      value,
    }))
  ),
  dateField("settledOn", "Settled on"),
];

function getFilterValue(row: SettlementRow, path: string[]) {
  const [key] = path;
  if (key === "status") {
    return row.status;
  }
  if (key === "settledOn") {
    return row.settledOn;
  }
  return;
}

function searchSettlement(row: SettlementRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q || [row.externalId, row.utr ?? ""].join(" ").toLowerCase().includes(q)
  );
}

const unlinkedOf = (row: SettlementRow) =>
  (row.items ?? []).filter((line) => isUnlinkedLine(line)).length;

function moneyColumn(
  id: string,
  title: string,
  get: (row: SettlementRow) => number
): DataGridColumnDef<SettlementRow> {
  return {
    accessorFn: get,
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">
        {formatPaise(get(row.original))}
      </span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title={title} visibility={true} />
    ),
    id,
    meta: {
      cellClassName: "text-right",
      headerTitle: title,
      skeleton: SKELETON_NUMBER,
    },
    size: 130,
  };
}

/**
 * The Income page's Settlements tab: one row per payout from the Razorpay
 * clearing balance to the bank, its lines summed. Read-only.
 */
export function SettlementsTable({
  data,
  isLoading,
  onOpen,
}: {
  data: SettlementRow[];
  isLoading: boolean;
  onOpen: (row: SettlementRow) => void;
}) {
  const getRowId = useEventCallback((row: SettlementRow) => row.id);
  const columns: DataGridColumnDef<SettlementRow>[] = [
    {
      accessorFn: (row) => row.settledOn,
      cell: ({ row }) => formatReceivedOn(row.original.settledOn),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Settled on"
          visibility={true}
        />
      ),
      id: "settledOn",
      meta: {
        compact: "primary",
        headerTitle: "Settled on",
        kind: "date",
        skeleton: SKELETON_TEXT,
      },
      size: 130,
    },
    {
      accessorFn: (row) => row.externalId,
      cell: ({ row }) => (
        <span className="font-mono text-xs" title={row.original.externalId}>
          {shortId(row.original.externalId)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Settlement ID"
          visibility={true}
        />
      ),
      id: "externalId",
      meta: { headerTitle: "Settlement ID", skeleton: SKELETON_TEXT },
      size: 170,
    },
    {
      accessorFn: (row) => row.paymentCount ?? 0,
      cell: ({ row }) => {
        const unlinked = unlinkedOf(row.original);
        return (
          <span className="flex items-center justify-end gap-2 tabular-nums">
            {unlinked > 0 ? (
              <Tag title="Payments or refunds not imported yet">
                {unlinked.toLocaleString("en-IN")} unlinked
              </Tag>
            ) : null}
            {(row.original.paymentCount ?? 0).toLocaleString("en-IN")}
          </span>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Payments"
          visibility={true}
        />
      ),
      id: "payments",
      meta: {
        cellClassName: "text-right",
        headerTitle: "Payments",
        skeleton: SKELETON_NUMBER,
      },
      size: 150,
    },
    moneyColumn("gross", "Gross", (row) => row.grossPaise ?? 0),
    moneyColumn(
      "fees",
      "Fees + GST",
      (row) =>
        (row.feesPaise ?? 0) + (row.taxPaise ?? 0) + settlementOwnFeePaise(row)
    ),
    moneyColumn("refunds", "Refunds", (row) => row.refundsPaise ?? 0),
    {
      ...moneyColumn("net", "Net paid", (row) => row.amountPaise),
      meta: {
        cellClassName: "text-right font-semibold",
        compact: "primary",
        headerTitle: "Net paid",
        skeleton: SKELETON_NUMBER,
      },
    },
    {
      accessorFn: (row) => row.utr ?? "",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.utr ?? "—"}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="UTR" visibility={true} />
      ),
      id: "utr",
      meta: { headerTitle: "UTR", skeleton: SKELETON_TEXT },
      size: 170,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const status = row.original.status as GatewaySettlementStatus;
        return (
          <StatusBadge
            data-testid="settlement-status"
            tone={SETTLEMENT_STATUS_TONES[status] ?? "neutral"}
          >
            {SETTLEMENT_STATUS_LABELS[status] ?? status}
          </StatusBadge>
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
        skeleton: SKELETON_TEXT,
      },
      size: 120,
    },
  ];

  return (
    <DataTableWrapper<SettlementRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No settlements match."
      filter={{
        fields: FILTER_FIELDS,
        getValue: getFilterValue,
        queryKey: "settlementFilters",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={onOpen}
      searchFn={searchSettlement}
      searchPlaceholder="Search settlement ID or UTR..."
      searchQueryKey="settlementSearch"
      storageKey="settlements_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
