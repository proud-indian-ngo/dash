import {
  CheckmarkCircle02Icon,
  Mail01Icon,
  MessageNotification01Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { TOPIC_CATALOG } from "@pi-dash/notifications/topics";
import type { ReactNode } from "react";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  SELECT_IS_ONLY_OPERATORS,
  selectField,
} from "@/components/data-table/filter-fields";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { StatItem } from "@/components/stats/stats-cards";
import {
  DELIVERY_STATS_DAYS,
  type DeliveryRow,
  type DeliveryStats,
  EMAIL_STATUS,
  deliverySubtitle,
  formatIndiaTime,
  INBOX_STATUS,
  NO_STATUS,
  statusOptions,
  WHATSAPP_STATUS,
} from "@/lib/notification-delivery";

const SKELETON_DATE = <Skeleton className="h-4 w-28" />;
const SKELETON_TEXT = <Skeleton className="h-4 w-32" />;
const SKELETON_TITLE = <Skeleton className="h-8 w-48" />;
const SKELETON_BADGE = <Skeleton className="h-5 w-16" />;

const TOPIC_OPTIONS = TOPIC_CATALOG.map((topic) => ({
  label: topic.id,
  value: topic.id,
})).sort((a, b) => a.label.localeCompare(b.label));

export function createDeliveryFilterFields(
  recipients: readonly { id: string; name: string }[]
): FilterField[] {
  return [
    selectField("topic", "Topic", TOPIC_OPTIONS, SELECT_IS_ONLY_OPERATORS),
    selectField(
      "recipient",
      "Recipient",
      recipients.map((r) => ({ label: r.name, value: r.id })),
      SELECT_IS_ONLY_OPERATORS
    ),
    selectField(
      "inbox",
      "Inbox",
      statusOptions(INBOX_STATUS),
      SELECT_IS_ONLY_OPERATORS
    ),
    selectField(
      "whatsapp",
      "WhatsApp",
      statusOptions(WHATSAPP_STATUS),
      SELECT_IS_ONLY_OPERATORS
    ),
    selectField(
      "email",
      "Email",
      statusOptions(EMAIL_STATUS),
      SELECT_IS_ONLY_OPERATORS
    ),
  ];
}

export function computeDeliveryStats(stats: DeliveryStats | null): StatItem[] {
  const days = `Last ${DELIVERY_STATS_DAYS} days`;
  return [
    {
      description: days,
      icon: MessageNotification01Icon,
      label: "Notifications sent",
      value: stats?.notificationsSent ?? 0,
    },
    {
      description: days,
      hint: "WhatsApp messages Meta reported delivered or read, summaries included.",
      icon: CheckmarkCircle02Icon,
      label: "WhatsApp delivered or read",
      value: stats?.whatsappDelivered ?? 0,
    },
    {
      description: days,
      icon: MultiplicationSignCircleIcon,
      label: "WhatsApp failed",
      tone: (stats?.whatsappFailed ?? 0) > 0 ? "danger" : undefined,
      value: stats?.whatsappFailed ?? 0,
    },
    {
      description: `${days}, ${stats?.emailsNotDelivered ?? 0} bounced or failed`,
      hint: "Emails Resend reported delivered, summaries included. Bounced or failed counts bounces, failures and addresses on Resend's suppression list.",
      icon: Mail01Icon,
      label: "Emails delivered",
      value: stats?.emailsDelivered ?? 0,
    },
  ];
}

/** A status badge, or a muted dash where the channel doesn't apply. */
function statusCell(display: { label: string; tone: StatusTone }): ReactNode {
  return display.label === NO_STATUS ? (
    <span className="text-muted-foreground">{display.label}</span>
  ) : (
    <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
  );
}

/** The server already searched; this keeps the page's rows consistent. */
function searchDelivery(row: DeliveryRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return [row.recipientName, row.title].join(" ").toLowerCase().includes(q);
}

const columns: DataGridColumnDef<DeliveryRow>[] = [
  {
    accessorFn: (row) => formatIndiaTime(row.createdAt),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Time" visibility={true} />
    ),
    id: "createdAt",
    meta: {
      compact: "trailing",
      headerTitle: "Time",
      icon: COLUMN_ICONS.createdAt,
      kind: "date",
      skeleton: SKELETON_DATE,
    },
    size: 190,
  },
  {
    accessorFn: (row) => row.recipientName ?? "Unknown",
    cell: ({ row }) => (
      <span className="truncate font-medium">
        {row.original.recipientName ?? "Unknown"}
      </span>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Recipient"
        visibility={true}
      />
    ),
    id: "recipient",
    meta: {
      compact: "primary",
      headerTitle: "Recipient",
      kind: "person",
      skeleton: SKELETON_TEXT,
    },
    size: 150,
  },
  {
    accessorFn: (row) => row.title,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{row.original.title}</span>
        <span className="text-muted-foreground truncate text-xs">
          {deliverySubtitle(row.original)}
        </span>
      </div>
    ),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Notification"
        visibility={true}
      />
    ),
    id: "title",
    meta: {
      compact: "primary",
      headerTitle: "Notification",
      icon: COLUMN_ICONS.message,
      kind: "text",
      skeleton: SKELETON_TITLE,
    },
    size: 240,
  },
  {
    accessorFn: (row) => INBOX_STATUS[row.inbox].label,
    cell: ({ row }) => statusCell(INBOX_STATUS[row.original.inbox]),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Inbox" visibility={true} />
    ),
    id: "inbox",
    meta: {
      headerTitle: "Inbox",
      icon: COLUMN_ICONS.inbox,
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 100,
  },
  {
    accessorFn: (row) => WHATSAPP_STATUS[row.whatsapp].label,
    cell: ({ row }) => statusCell(WHATSAPP_STATUS[row.original.whatsapp]),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="WhatsApp"
        visibility={true}
      />
    ),
    id: "whatsapp",
    meta: {
      compact: "primary",
      headerTitle: "WhatsApp",
      icon: COLUMN_ICONS.whatsappDelivery,
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 140,
  },
  {
    accessorFn: (row) => EMAIL_STATUS[row.email].label,
    cell: ({ row }) => statusCell(EMAIL_STATUS[row.original.email]),
    enableSorting: false,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Email" visibility={true} />
    ),
    id: "email",
    meta: {
      headerTitle: "Email",
      icon: COLUMN_ICONS.emailDelivery,
      kind: "status",
      skeleton: SKELETON_BADGE,
    },
    size: 130,
  },
];

function getRowId(row: DeliveryRow): string {
  return row.id;
}

export function DeliveryTable({
  isLoading,
  onView,
  recipients,
  rowCount,
  rows,
}: {
  isLoading: boolean;
  onView: (row: DeliveryRow) => void;
  recipients: readonly { id: string; name: string }[];
  rowCount: number;
  rows: DeliveryRow[];
}) {
  return (
    <DataTableWrapper<DeliveryRow>
      columns={columns}
      compactOnMobile
      data={rows}
      emptyMessage="No notifications in the last 90 days match."
      filter={{
        applyLocally: false,
        fields: createDeliveryFilterFields(recipients),
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      manualPagination
      onRowClick={onView}
      rowCount={rowCount}
      searchFn={searchDelivery}
      searchPlaceholder="Search title or recipient..."
      storageKey="notification_delivery_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsMovable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
