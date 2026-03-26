import {
  DataGrid,
  DataGridContainer,
} from "@pi-dash/design-system/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@pi-dash/design-system/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@pi-dash/design-system/components/reui/data-grid/data-grid-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";

import { EventActionsMenu } from "@/components/teams/events/event-actions-menu";
import type { EventRow } from "@/components/teams/events/events-table-helpers";
import { SHORT_MONTH_DATE_TIME } from "@/lib/date-formats";

export interface OccurrencesSubTableProps {
  canManage: boolean;
  occurrences: EventRow[];
  onCancelEvent: (event: EventRow) => void;
  onEditEvent: (event: EventRow) => void;
  onSelectEvent: (event: EventRow) => void;
}

export function OccurrencesSubTable({
  occurrences,
  canManage,
  onSelectEvent,
  onEditEvent,
  onCancelEvent,
}: OccurrencesSubTableProps) {
  const columns: ColumnDef<EventRow>[] = [
    {
      accessorKey: "startTime",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Date/Time" />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {format(new Date(row.original.startTime), SHORT_MONTH_DATE_TIME)}
        </span>
      ),
      size: 180,
    },
    {
      accessorKey: "location",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Location" />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {row.original.location || "\u2014"}
        </span>
      ),
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
  ];

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
