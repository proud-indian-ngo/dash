import { GitForkIcon, RepeatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { EventActionsMenu } from "@/components/teams/events/event-actions-menu";
import type { EventDisplayRow } from "@/components/teams/events/events-table-helpers";
import {
  getEventStatus,
  getRecurrenceLabel,
  SKELETON_BADGE,
  SKELETON_COUNT,
  SKELETON_DATETIME,
  SKELETON_LOCATION,
  SKELETON_NAME,
} from "@/components/teams/events/events-table-helpers";
import { SHORT_MONTH_DATE_TIME } from "@/lib/date-formats";

interface ColumnCallbacks {
  canCancelPast: boolean;
  canCreate: boolean;
  canManage: boolean;
  onCancelEvent: (row: EventDisplayRow) => void;
  onDuplicateEvent: (row: EventDisplayRow) => void;
  onEditEvent: (row: EventDisplayRow) => void;
  onSelectEvent: (row: EventDisplayRow) => void;
}

function getSeriesIcon(row: EventDisplayRow) {
  if (row.seriesId) {
    return RepeatIcon;
  }
  if (row.event.recurrenceRule) {
    return GitForkIcon;
  }
  return null;
}

export function createEventsTableColumns({
  canCancelPast,
  canCreate,
  canManage,
  onCancelEvent,
  onDuplicateEvent,
  onEditEvent,
  onSelectEvent,
}: ColumnCallbacks): (ColumnDef<EventDisplayRow> & {
  enableColumnOrdering?: boolean;
})[] {
  return [
    {
      accessorFn: (row) => row.event.name,
      cell: ({ row }) => {
        const seriesIcon = getSeriesIcon(row.original);
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {seriesIcon && (
              <HugeiconsIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                icon={seriesIcon}
                strokeWidth={2}
              />
            )}
            <button
              className="truncate text-left font-medium text-sm hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEvent(row.original);
              }}
              type="button"
            >
              {row.original.event.name}
            </button>
          </div>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "name",
      meta: {
        headerTitle: "Name",
        skeleton: SKELETON_NAME,
      },
      size: 200,
    },
    {
      cell: ({ row }) => {
        const { label, variant } = getEventStatus(row.original);
        return <Badge variant={variant}>{label}</Badge>;
      },
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: {
        headerTitle: "Status",
        skeleton: SKELETON_BADGE,
      },
      size: 90,
    },
    {
      accessorFn: (row) => row.startTime,
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {format(new Date(row.original.startTime), SHORT_MONTH_DATE_TIME)}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Date/Time"
          visibility={true}
        />
      ),
      id: "startTime",
      meta: {
        headerTitle: "Date/Time",
        skeleton: SKELETON_DATETIME,
      },
      size: 180,
    },
    {
      accessorFn: (row) => row.event.location,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.event.location || "\u2014"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Location"
          visibility={true}
        />
      ),
      id: "location",
      meta: {
        headerTitle: "Location",
        skeleton: SKELETON_LOCATION,
      },
      size: 140,
    },
    {
      accessorFn: (row) => row.event.city,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm capitalize">
          {row.original.event.city || "\u2014"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="City" visibility={true} />
      ),
      id: "city",
      meta: {
        headerTitle: "City",
        skeleton: SKELETON_LOCATION,
      },
      size: 120,
    },
    {
      accessorFn: (row) => row.event.isPublic,
      cell: ({ row }) =>
        row.original.event.isPublic ? (
          <Badge variant="default">Public</Badge>
        ) : (
          <Badge variant="secondary">Private</Badge>
        ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Public"
          visibility={true}
        />
      ),
      id: "isPublic",
      meta: {
        headerTitle: "Public",
        skeleton: SKELETON_BADGE,
      },
      size: 80,
    },
    {
      cell: ({ row }) => {
        const rule = row.original.event.recurrenceRule as
          | { rrule: string }
          | null
          | undefined;
        const label = getRecurrenceLabel(rule);
        return (
          <Badge variant={label === "One-time" ? "secondary" : "outline"}>
            {label}
          </Badge>
        );
      },
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Recurrence"
          visibility={true}
        />
      ),
      id: "recurrence",
      meta: {
        headerTitle: "Recurrence",
        skeleton: SKELETON_BADGE,
      },
      size: 100,
    },
    {
      accessorFn: (row) => row.members.length,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.members.length}</span>
      ),
      enableSorting: false,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Volunteers"
          visibility={true}
        />
      ),
      id: "members",
      meta: {
        headerTitle: "Volunteers",
        skeleton: SKELETON_COUNT,
      },
      size: 80,
    },
    {
      cell: ({ row }) => (
        <EventActionsMenu
          canCancel={
            canManage &&
            (canCancelPast || row.original.event.startTime > Date.now())
          }
          canCreate={canCreate}
          canManage={canManage}
          onCancelEvent={() => onCancelEvent(row.original)}
          onDuplicateEvent={() => onDuplicateEvent(row.original)}
          onEditEvent={() => onEditEvent(row.original)}
          onSelectEvent={() => onSelectEvent(row.original)}
        />
      ),
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: { cellClassName: "text-center", stopRowClick: true },
      minSize: 52,
      size: 52,
    },
  ];
}
