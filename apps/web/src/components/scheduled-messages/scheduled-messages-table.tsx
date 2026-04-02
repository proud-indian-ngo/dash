import {
  Cancel01Icon,
  Delete02Icon,
  MoreVerticalIcon,
  PencilEdit01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pi-dash/design-system/components/ui/tooltip";
import type { ScheduledMessage } from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { SHORT_DATE_WITH_SECONDS } from "@/lib/date-formats";

interface Recipient {
  id: string;
  label: string;
  type: "group" | "user";
}

type ScheduledMessageRow = ScheduledMessage & {
  creator?: { name: string } | null;
};

function getStatusBadge(status: string | null) {
  switch (status) {
    case "sent":
      return { label: "Sent", variant: "success" as const };
    case "failed":
      return { label: "Failed", variant: "destructive" as const };
    case "cancelled":
      return { label: "Cancelled", variant: "warning" as const };
    default:
      return { label: "Pending", variant: "outline" as const };
  }
}

const SKELETON_MSG = <Skeleton className="h-4 w-48" />;
const SKELETON_DATE = <Skeleton className="h-4 w-28" />;
const SKELETON_STATUS = <Skeleton className="h-5 w-16" />;
const SKELETON_RECIPIENTS = <Skeleton className="h-4 w-12" />;
const SKELETON_CREATOR = <Skeleton className="h-4 w-24" />;
const SKELETON_ACTIONS = <Skeleton className="size-8" />;

function formatTs(ts: number): string {
  try {
    return format(new Date(ts), SHORT_DATE_WITH_SECONDS);
  } catch {
    return "\u2014";
  }
}

function searchMessage(row: ScheduledMessageRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.message, row.status, row.creator?.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function createColumns(
  onView: (row: ScheduledMessageRow) => void,
  onEdit: (row: ScheduledMessageRow) => void,
  onCancel: (row: ScheduledMessageRow) => void,
  onDelete: (row: ScheduledMessageRow) => void
): ColumnDef<ScheduledMessageRow>[] {
  return [
    {
      id: "message",
      accessorFn: (row) => row.message,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Message"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {row.original.message.length > 80
            ? `${row.original.message.slice(0, 80)}...`
            : row.original.message}
        </span>
      ),
      meta: { headerTitle: "Message", skeleton: SKELETON_MSG },
      size: 300,
    },
    {
      id: "scheduledAt",
      accessorFn: (row) => row.scheduledAt,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Scheduled At"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{formatTs(row.original.scheduledAt)}</span>
      ),
      meta: { headerTitle: "Scheduled At", skeleton: SKELETON_DATE },
      size: 180,
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const badge = getStatusBadge(row.original.status);
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
      meta: { headerTitle: "Status", skeleton: SKELETON_STATUS },
      size: 120,
    },
    {
      id: "recipients",
      accessorFn: (row) => (row.recipients as Recipient[]).length,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Recipients"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const recipients = row.original.recipients as Recipient[];
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="cursor-default text-sm">
                  {recipients.length} recipient
                  {recipients.length === 1 ? "" : "s"}
                </span>
              }
            />
            <TooltipContent>
              <div className="flex flex-col gap-0.5">
                {recipients.map((r) => (
                  <span key={r.id}>
                    {r.type === "group" ? "Group: " : "User: "}
                    {r.label}
                  </span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
      meta: { headerTitle: "Recipients", skeleton: SKELETON_RECIPIENTS },
      size: 120,
    },
    {
      id: "creator",
      accessorFn: (row) => row.creator?.name ?? "",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Created By"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.creator?.name ?? "\u2014"}
        </span>
      ),
      meta: { headerTitle: "Created By", skeleton: SKELETON_CREATOR },
      size: 160,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const msg = row.original;
        const isPending = msg.status === "pending";

        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation wrapper
          // biome-ignore lint/a11y/noStaticElementInteractions: same
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Row actions"
                    className="size-8"
                    data-testid="row-actions"
                    onClick={(e) => e.stopPropagation()}
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
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onView(msg)}>
                  <HugeiconsIcon
                    className="mr-2 size-4"
                    icon={ViewIcon}
                    strokeWidth={2}
                  />
                  View details
                </DropdownMenuItem>
                {isPending && (
                  <DropdownMenuItem onClick={() => onEdit(msg)}>
                    <HugeiconsIcon
                      className="mr-2 size-4"
                      icon={PencilEdit01Icon}
                      strokeWidth={2}
                    />
                    Edit
                  </DropdownMenuItem>
                )}
                {isPending && (
                  <DropdownMenuItem
                    onClick={() => onCancel(msg)}
                    variant="destructive"
                  >
                    <HugeiconsIcon
                      className="mr-2 size-4"
                      icon={Cancel01Icon}
                      strokeWidth={2}
                    />
                    Cancel
                  </DropdownMenuItem>
                )}
                {!isPending && (
                  <DropdownMenuItem
                    onClick={() => onDelete(msg)}
                    variant="destructive"
                  >
                    <HugeiconsIcon
                      className="mr-2 size-4"
                      icon={Delete02Icon}
                      strokeWidth={2}
                    />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      meta: { cellClassName: "text-center", skeleton: SKELETON_ACTIONS },
      size: 52,
      minSize: 52,
    },
  ];
}

interface ScheduledMessagesTableProps {
  isLoading?: boolean;
  messages: ScheduledMessageRow[];
  onCancel: (row: ScheduledMessageRow) => void;
  onDelete: (row: ScheduledMessageRow) => void;
  onEdit: (row: ScheduledMessageRow) => void;
  onView: (row: ScheduledMessageRow) => void;
  toolbarActions?: ReactNode;
}

export type { ScheduledMessageRow };

export function ScheduledMessagesTable({
  isLoading,
  messages,
  onCancel,
  onDelete,
  onEdit,
  onView,
  toolbarActions,
}: ScheduledMessagesTableProps) {
  const columns = createColumns(onView, onEdit, onCancel, onDelete);

  return (
    <DataTableWrapper<ScheduledMessageRow>
      columns={columns}
      data={messages}
      emptyMessage="No scheduled messages."
      getRowId={(row) => row.id}
      isLoading={isLoading}
      onRowClick={onView}
      searchFn={searchMessage}
      searchPlaceholder="Search messages..."
      storageKey="scheduled_messages_table_state_v1"
      tableLayout={{
        columnsMovable: true,
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
