import { RepeatIcon } from "@hugeicons/core-free-icons";
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
  canManage: boolean;
  onCancelEvent: (row: EventDisplayRow) => void;
  onEditEvent: (row: EventDisplayRow) => void;
  onSelectEvent: (row: EventDisplayRow) => void;
}

export function createEventsTableColumns({
  canManage,
  onCancelEvent,
  onEditEvent,
  onSelectEvent,
}: ColumnCallbacks): (ColumnDef<EventDisplayRow> & {
  enableColumnOrdering?: boolean;
})[] {
  return [
    {
      id: "name",
      accessorFn: (row) => row.event.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      cell: ({ row }) => {
        const hasStarted = new Date(row.original.startTime) <= new Date();
        const isSeries = !!row.original.seriesId;
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {isSeries ? (
              <HugeiconsIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                icon={RepeatIcon}
                strokeWidth={2}
              />
            ) : null}
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
            {hasStarted ? (
              <Badge className="shrink-0" variant="outline">
                Recap
              </Badge>
            ) : null}
          </div>
        );
      },
      meta: {
        headerTitle: "Name",
        skeleton: SKELETON_NAME,
      },
      size: 200,
    },
    {
      id: "status",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const { label, variant } = getEventStatus(row.original);
        return <Badge variant={variant}>{label}</Badge>;
      },
      meta: {
        headerTitle: "Status",
        skeleton: SKELETON_BADGE,
      },
      size: 90,
      enableSorting: false,
    },
    {
      id: "startTime",
      accessorFn: (row) => row.startTime,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Date/Time"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {format(new Date(row.original.startTime), SHORT_MONTH_DATE_TIME)}
        </span>
      ),
      meta: {
        headerTitle: "Date/Time",
        skeleton: SKELETON_DATETIME,
      },
      size: 180,
    },
    {
      id: "location",
      accessorFn: (row) => row.event.location,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Location"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.event.location || "\u2014"}
        </span>
      ),
      meta: {
        headerTitle: "Location",
        skeleton: SKELETON_LOCATION,
      },
      size: 140,
    },
    {
      id: "isPublic",
      accessorFn: (row) => row.event.isPublic,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Public"
          visibility={true}
        />
      ),
      cell: ({ row }) =>
        row.original.event.isPublic ? (
          <Badge variant="default">Public</Badge>
        ) : (
          <Badge variant="secondary">Private</Badge>
        ),
      meta: {
        headerTitle: "Public",
        skeleton: SKELETON_BADGE,
      },
      size: 80,
      enableSorting: false,
    },
    {
      id: "recurrence",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Recurrence"
          visibility={true}
        />
      ),
      cell: ({ row }) => {
        const rule = row.original.event.recurrenceRule as
          | { rrule: string }
          | null
          | undefined;
        const label = getRecurrenceLabel(rule);
        return (
          <Badge variant={label === "One-time" ? "secondary" : "default"}>
            {label}
          </Badge>
        );
      },
      meta: {
        headerTitle: "Recurrence",
        skeleton: SKELETON_BADGE,
      },
      size: 100,
      enableSorting: false,
    },
    {
      id: "members",
      accessorFn: (row) => row.members.length,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Volunteers"
          visibility={true}
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.members.length}</span>
      ),
      meta: {
        headerTitle: "Volunteers",
        skeleton: SKELETON_COUNT,
      },
      size: 80,
      enableSorting: false,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <EventActionsMenu
          canManage={canManage}
          onCancelEvent={() => onCancelEvent(row.original)}
          onEditEvent={() => onEditEvent(row.original)}
          onSelectEvent={() => onSelectEvent(row.original)}
        />
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      enableColumnOrdering: false,
      meta: { cellClassName: "text-center" },
      size: 52,
      minSize: 52,
    },
  ];
}
