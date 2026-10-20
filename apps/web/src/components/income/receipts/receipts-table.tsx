import {
  Cancel01Icon,
  Download04Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise } from "@pi-dash/shared/money";
import { format } from "date-fns";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { DATE_TIME } from "@/lib/date-formats";

import { formatReceivedOn } from "../income-date";
import {
  RECEIPT_STATUS_LABELS,
  type ReceiptRow,
  receiptDonorName,
  receiptPdfUrl,
  receiptStatus,
} from "./receipt-types";

type ReceiptAction = Parameters<
  typeof ResponsiveActionMenu
>[0]["actions"][number];

const SKELETON_DATE = <Skeleton className="h-5 w-24" />;
const SKELETON_TEXT = <Skeleton className="h-5 w-40" />;

const FILTER_FIELDS: FilterField[] = [
  selectField("status", "Status", [
    { label: RECEIPT_STATUS_LABELS.issued, value: "issued" },
    { label: RECEIPT_STATUS_LABELS.voided, value: "voided" },
  ]),
  dateField("issuedOn", "Issued on"),
];

function getReceiptFilterValue(row: ReceiptRow, path: string[]) {
  const [key] = path;
  if (key === "status") {
    return receiptStatus(row);
  }
  if (key === "issuedOn") {
    return row.issuedOn;
  }
  return;
}

function searchReceipts(row: ReceiptRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [row.number, receiptDonorName(row)].join(" ").toLowerCase().includes(q)
  );
}

export function ReceiptStatusBadge({
  row,
}: {
  row: { voidedAt?: number | null };
}) {
  const status = receiptStatus(row);
  return (
    <StatusBadge
      data-testid="receipt-status"
      tone={status === "voided" ? "neutral" : "success"}
    >
      {RECEIPT_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

/** Download, Email and Void for one receipt; issuers only. */
export function receiptActions({
  emailing,
  onEmail,
  onVoid,
  row,
}: {
  emailing: boolean;
  onEmail: (row: ReceiptRow) => void;
  onVoid: (row: ReceiptRow) => void;
  row: ReceiptRow;
}): ReceiptAction[] {
  const live = !row.voidedAt;
  return [
    {
      icon: Download04Icon,
      id: "download",
      label: "Download PDF",
      render: (
        <a aria-label="Download PDF" download href={receiptPdfUrl(row.id)} />
      ),
    },
    ...(live
      ? [
          {
            disabled: emailing,
            icon: Mail01Icon,
            id: "email",
            label: "Email receipt",
            onSelect: () => onEmail(row),
          },
          {
            destructive: true,
            group: "destructive",
            icon: Cancel01Icon,
            id: "void",
            label: "Void receipt",
            onSelect: () => onVoid(row),
          },
        ]
      : []),
  ];
}

function RowActions(props: {
  emailing: boolean;
  onEmail: (row: ReceiptRow) => void;
  onVoid: (row: ReceiptRow) => void;
  row: ReceiptRow;
}) {
  const stopPropagation = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  return (
    <ResponsiveActionMenu
      actions={receiptActions(props)}
      title="Receipt actions"
      trigger={<RowActionsButton onClick={stopPropagation} />}
    />
  );
}

export function ReceiptsTable({
  canIssue,
  data,
  isLoading,
  onEmail,
  onView,
  onVoid,
  sendingId,
}: {
  /** The receipt whose email is being queued, if any. */
  sendingId: string | null;
  /** donors.receipt: download, email and void. */
  canIssue: boolean;
  data: ReceiptRow[];
  isLoading: boolean;
  onEmail: (row: ReceiptRow) => void;
  onView: (row: ReceiptRow) => void;
  onVoid: (row: ReceiptRow) => void;
}) {
  const getRowId = useEventCallback((row: ReceiptRow) => row.id);
  const columns: DataGridColumnDef<ReceiptRow>[] = [
    {
      accessorFn: (row) => row.number,
      cell: ({ row }) => (
        <span className="font-mono" data-testid="receipt-number">
          {row.original.number}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Number"
          visibility={true}
        />
      ),
      id: "number",
      meta: {
        compact: "primary",
        headerTitle: "Number",
        skeleton: SKELETON_TEXT,
      },
      size: 170,
    },
    {
      accessorFn: (row) => row.issuedOn,
      cell: ({ row }) => formatReceivedOn(row.original.issuedOn),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Issued On"
          visibility={true}
        />
      ),
      id: "issuedOn",
      meta: { headerTitle: "Issued On", kind: "date", skeleton: SKELETON_DATE },
      size: 130,
    },
    {
      accessorFn: (row) => receiptDonorName(row),
      cell: ({ row }) => (
        <span className="truncate">{receiptDonorName(row.original)}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Donor" visibility={true} />
      ),
      id: "donor",
      meta: {
        compact: "primary",
        headerTitle: "Donor",
        icon: COLUMN_ICONS.donor,
        skeleton: SKELETON_TEXT,
      },
      size: 220,
    },
    {
      accessorFn: (row) => row.contribution?.amountPaise ?? 0,
      cell: ({ row }) =>
        row.original.contribution
          ? formatPaise(row.original.contribution.amountPaise)
          : "—",
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
      accessorFn: (row) => receiptStatus(row),
      cell: ({ row }) => <ReceiptStatusBadge row={row.original} />,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: { headerTitle: "Status", skeleton: SKELETON_DATE },
      size: 110,
    },
    {
      accessorFn: (row) => row.emailedAt ?? 0,
      cell: ({ row }) =>
        row.original.emailedAt ? (
          <span className="font-mono text-sm">
            {format(new Date(row.original.emailedAt), DATE_TIME)}
          </span>
        ) : (
          <span className="text-muted-foreground">Not emailed</span>
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Emailed"
          visibility={true}
        />
      ),
      id: "emailedAt",
      meta: { headerTitle: "Emailed", skeleton: SKELETON_DATE },
      size: 170,
    },
    ...(canIssue
      ? [
          {
            cell: ({ row }) => (
              <RowActions
                emailing={sendingId !== null}
                onEmail={onEmail}
                onVoid={onVoid}
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
          } satisfies DataGridColumnDef<ReceiptRow>,
        ]
      : []),
  ];

  return (
    <DataTableWrapper<ReceiptRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No receipts match."
      filter={{
        fields: FILTER_FIELDS,
        getValue: getReceiptFilterValue,
        queryKey: "receiptFilters",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={onView}
      searchFn={searchReceipts}
      searchPlaceholder="Search number or donor..."
      searchQueryKey="receiptSearch"
      storageKey="contribution_receipts_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
