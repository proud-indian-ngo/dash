import {
  AddSquareIcon,
  MinusSignSquareIcon,
  MoreVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  DataGrid,
  DataGridContainer,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@pi-dash/design-system/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@pi-dash/design-system/components/reui/data-grid/data-grid-table";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type {
  TeamEvent,
  TeamEventMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";

export type EventRow = TeamEvent & {
  members: ReadonlyArray<TeamEventMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

interface EventsTableProps {
  canManage: boolean;
  events: EventRow[];
  isLoading?: boolean;
  onCancelEvent: (event: EventRow) => void;
  onEditEvent: (event: EventRow) => void;
  onSelectEvent: (event: EventRow) => void;
  toolbarActions?: ReactNode;
}

type ParentEventRow = EventRow & {
  occurrences: EventRow[];
};

function getEventStatus(event: EventRow): {
  label: string;
  variant: "destructive" | "outline" | "secondary" | "success-outline";
} {
  if (event.cancelledAt) {
    return { label: "Cancelled", variant: "destructive" };
  }
  const eventEnd = event.endTime ?? event.startTime;
  if (new Date(eventEnd) < new Date()) {
    return { label: "Past", variant: "secondary" };
  }
  return { label: "Upcoming", variant: "success-outline" };
}

function getRecurrenceLabel(
  rule: { frequency: string } | null | undefined
): string {
  if (!rule) {
    return "One-time";
  }
  switch (rule.frequency) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Biweekly";
    case "monthly":
      return "Monthly";
    default:
      return "One-time";
  }
}

const SKELETON_NAME = <Skeleton className="h-5 w-36" />;
const SKELETON_DATETIME = <Skeleton className="h-5 w-40" />;
const SKELETON_LOCATION = <Skeleton className="h-5 w-28" />;
const SKELETON_BADGE = <Skeleton className="h-5 w-16" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-10" />;

function EventActionsMenu({
  canManage,
  event,
  onCancelEvent,
  onEditEvent,
  onSelectEvent,
}: {
  canManage: boolean;
  event: EventRow;
  onCancelEvent: (event: EventRow) => void;
  onEditEvent: (event: EventRow) => void;
  onSelectEvent: (event: EventRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-7"
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
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={() => onSelectEvent(event)}>
          View
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem onClick={() => onEditEvent(event)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onCancelEvent(event)}
              variant="destructive"
            >
              Cancel
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OccurrencesSubTable({
  occurrences,
  canManage,
  onSelectEvent,
  onEditEvent,
  onCancelEvent,
}: {
  occurrences: EventRow[];
  canManage: boolean;
  onSelectEvent: (event: EventRow) => void;
  onEditEvent: (event: EventRow) => void;
  onCancelEvent: (event: EventRow) => void;
}) {
  const columns = useMemo<ColumnDef<EventRow>[]>(
    () => [
      {
        accessorKey: "startTime",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Date/Time" />
        ),
        cell: ({ row }) =>
          format(new Date(row.original.startTime), "MMM d, yyyy h:mm a"),
        size: 180,
      },
      {
        accessorKey: "location",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Location" />
        ),
        cell: ({ row }) => row.original.location || "\u2014",
        size: 140,
      },
      {
        id: "members",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Volunteers" />
        ),
        cell: ({ row }) => row.original.members.length,
        size: 80,
        enableSorting: false,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <EventActionsMenu
            canManage={canManage}
            event={row.original}
            onCancelEvent={onCancelEvent}
            onEditEvent={onEditEvent}
            onSelectEvent={onSelectEvent}
          />
        ),
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        size: 52,
        minSize: 52,
      },
    ],
    [canManage, onSelectEvent, onEditEvent, onCancelEvent]
  );

  const table = useReactTable({
    data: occurrences,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 5 },
    },
  });

  return (
    <div className="bg-muted/20 p-3">
      <DataGrid recordCount={occurrences.length} table={table}>
        <DataGridContainer border={false}>
          <DataGridTable />
        </DataGridContainer>
        {occurrences.length > 5 && <DataGridPagination />}
      </DataGrid>
    </div>
  );
}

function searchEvent(row: ParentEventRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.description ?? "", row.location ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function EventsTable({
  events,
  canManage,
  isLoading,
  onSelectEvent,
  onEditEvent,
  onCancelEvent,
  toolbarActions,
}: EventsTableProps) {
  const parentRows = useMemo(() => {
    const parents: EventRow[] = [];
    const ocMap = new Map<string, EventRow[]>();

    for (const event of events) {
      if (event.parentEventId) {
        const list = ocMap.get(event.parentEventId) ?? [];
        list.push(event);
        ocMap.set(event.parentEventId, list);
      } else {
        parents.push(event);
      }
    }

    return parents.map<ParentEventRow>((p) => ({
      ...p,
      occurrences: ocMap.get(p.id) ?? [],
    }));
  }, [events]);

  const columns = useMemo<ColumnDef<ParentEventRow>[]>(
    () => [
      {
        id: "expand",
        header: "",
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              aria-label={
                row.getIsExpanded()
                  ? "Collapse occurrences"
                  : "Expand occurrences"
              }
              onClick={(e) => {
                e.stopPropagation();
                row.toggleExpanded();
              }}
              size="icon-sm"
              variant="ghost"
            >
              <HugeiconsIcon
                className="size-4"
                icon={row.getIsExpanded() ? MinusSignSquareIcon : AddSquareIcon}
                strokeWidth={2}
              />
            </Button>
          ) : null,
        size: 40,
        minSize: 40,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        enableColumnOrdering: false,
        meta: {
          expandedContent: (data: ParentEventRow) => (
            <OccurrencesSubTable
              canManage={canManage}
              occurrences={data.occurrences}
              onCancelEvent={onCancelEvent}
              onEditEvent={onEditEvent}
              onSelectEvent={onSelectEvent}
            />
          ),
        },
      },
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Name"
            visibility={true}
          />
        ),
        cell: ({ row }) => {
          const hasStarted = new Date(row.original.startTime) <= new Date();
          return (
            <div className="flex items-center gap-1.5">
              <button
                className="text-left font-medium text-sm hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEvent(row.original);
                }}
                type="button"
              >
                {row.original.name}
              </button>
              {hasStarted ? <Badge variant="outline">Recap</Badge> : null}
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
        cell: ({ row }) =>
          format(new Date(row.original.startTime), "MMM d, yyyy h:mm a"),
        meta: {
          headerTitle: "Date/Time",
          skeleton: SKELETON_DATETIME,
        },
        size: 180,
      },
      {
        id: "location",
        accessorFn: (row) => row.location,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Location"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.location || "\u2014"}
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
        accessorFn: (row) => row.isPublic,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Public"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          row.original.isPublic ? (
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
          const rule = row.original.recurrenceRule as
            | { frequency: string }
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
            event={row.original}
            onCancelEvent={onCancelEvent}
            onEditEvent={onEditEvent}
            onSelectEvent={onSelectEvent}
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
    ],
    [canManage, onSelectEvent, onEditEvent, onCancelEvent]
  );

  return (
    <DataTableWrapper<ParentEventRow>
      columns={columns}
      data={parentRows}
      defaultColumnPinning={{ left: ["expand"], right: ["actions"] }}
      emptyMessage="No events found."
      getRowCanExpand={(row) => row.original.occurrences.length > 0}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      searchFn={searchEvent}
      searchPlaceholder="Search events..."
      storageKey="events_table_state_v1"
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
