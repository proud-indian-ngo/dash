import {
  Cancel01Icon,
  Download04Icon,
  Mail01Icon,
  SentIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise } from "@pi-dash/shared/money";
import { receiptDeliveryState } from "@pi-dash/shared/receipts";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";

import { formatReceivedOn } from "../income-date";
import {
  RECEIPT_STATUS_LABELS,
  type ReceiptContacts,
  receiptDeliveryLabel,
  receiptDeliveryNoteLabel,
  type ReceiptRow,
  receiptDonorName,
  receiptPdfUrl,
  receiptSendOptions,
  receiptStatus,
} from "./receipt-types";
import type { ReceiptSend } from "./use-send-receipt";

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

const withReason = (label: string, reason: string | null) =>
  reason ? `${label} (${reason})` : label;

/** Download, the sends and Void for one receipt; issuers only. */
export function receiptActions({
  contacts,
  onSend,
  onVoid,
  row,
  sending,
}: ReceiptActionProps): ReceiptAction[] {
  const live = !row.voidedAt;
  const options = receiptSendOptions(row, contacts, Date.now());
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
          ...(options.now
            ? [
                {
                  disabled: sending || options.now.blocked !== null,
                  icon: SentIcon,
                  id: "send-now",
                  label: withReason("Send now", options.now.blocked),
                  onSelect: () => onSend("now", row),
                },
              ]
            : []),
          {
            disabled: sending || options.email !== null,
            icon: Mail01Icon,
            id: "email",
            label: withReason("Email receipt", options.email),
            onSelect: () => onSend("email", row),
          },
          {
            disabled: sending || options.whatsapp !== null,
            icon: WhatsappIcon,
            id: "whatsapp",
            label: withReason("Send on WhatsApp", options.whatsapp),
            onSelect: () => onSend("whatsapp", row),
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

interface ReceiptActionProps {
  contacts: ReceiptContacts | undefined;
  onSend: (how: ReceiptSend, row: ReceiptRow) => void;
  onVoid: (row: ReceiptRow) => void;
  row: ReceiptRow;
  /** A send is being queued; one at a time. */
  sending: boolean;
}

function RowActions(props: ReceiptActionProps) {
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

function DeliveryCell({ row }: { row: ReceiptRow }) {
  const note = receiptDeliveryNoteLabel(row);
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span
        className={
          receiptDeliveryState(row).kind === "sent"
            ? "truncate"
            : "text-muted-foreground truncate"
        }
        data-testid="receipt-delivery"
      >
        {receiptDeliveryLabel(row)}
      </span>
      {note ? (
        <span
          className="text-muted-foreground truncate text-xs"
          data-testid="receipt-delivery-note"
          title={note}
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}

/** Sorts receipts by when they were or will be sent; never-sent ones first. */
function deliverySortKey(row: ReceiptRow): number {
  const state = receiptDeliveryState(row);
  return state.kind === "sent" || state.kind === "scheduled" ? state.at : 0;
}

export function ReceiptsTable({
  canIssue,
  contacts,
  data,
  isLoading,
  onSend,
  onView,
  onVoid,
  sendingId,
}: {
  /** The receipt whose send is being queued, if any. */
  sendingId: string | null;
  /** donors.receipt: download, send and void. */
  canIssue: boolean;
  /** Which donors can be emailed or messaged, by receipt ID. */
  contacts: Record<string, ReceiptContacts> | null;
  data: ReceiptRow[];
  isLoading: boolean;
  onSend: (how: ReceiptSend, row: ReceiptRow) => void;
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
      accessorFn: deliverySortKey,
      cell: ({ row }) => <DeliveryCell row={row.original} />,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Delivery"
          visibility={true}
        />
      ),
      id: "delivery",
      meta: { headerTitle: "Delivery", skeleton: SKELETON_TEXT },
      size: 280,
    },
    ...(canIssue
      ? [
          {
            cell: ({ row }) => (
              <RowActions
                contacts={contacts?.[row.original.id]}
                onSend={onSend}
                onVoid={onVoid}
                row={row.original}
                sending={sendingId !== null}
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
      storageKey="contribution_receipts_table_state_v2"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
