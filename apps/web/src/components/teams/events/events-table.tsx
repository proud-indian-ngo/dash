import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { createEventsTableColumns } from "@/components/teams/events/events-table-columns";
import type { EventRow } from "@/components/teams/events/events-table-helpers";
import { searchEvent } from "@/components/teams/events/events-table-helpers";

export type { EventRow } from "@/components/teams/events/events-table-helpers";

interface EventsTableProps {
  canManage: boolean;
  events: EventRow[];
  isLoading?: boolean;
  onCancelEvent: (event: EventRow) => void;
  onEditEvent: (event: EventRow) => void;
  onSelectEvent: (event: EventRow) => void;
  toolbarActions?: ReactNode;
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
  // Filter to series parents + standalone events (no exceptions shown in main table for now)
  const rows = events.filter((e) => !e.seriesId);

  const columns = createEventsTableColumns({
    canManage,
    onCancelEvent,
    onEditEvent,
    onSelectEvent,
  });

  return (
    <DataTableWrapper<EventRow>
      columns={columns}
      data={rows}
      defaultColumnPinning={{ right: ["actions"] }}
      emptyMessage="No events found."
      getRowId={(row) => row.id}
      isLoading={isLoading}
      searchFn={searchEvent}
      searchPlaceholder="Search events..."
      storageKey="events_table_state_v2"
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
