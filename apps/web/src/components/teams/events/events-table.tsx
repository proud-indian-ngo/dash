import type { ReactNode } from "react";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { createEventsTableColumns } from "@/components/teams/events/events-table-columns";
import type {
  EventDisplayRow,
  EventRow,
} from "@/components/teams/events/events-table-helpers";
import {
  buildEventDisplayRows,
  getDefaultDateRange,
  searchDisplayRow,
} from "@/components/teams/events/events-table-helpers";

export type {
  EventDisplayRow,
  EventRow,
} from "@/components/teams/events/events-table-helpers";

interface EventsTableProps {
  canManage: boolean;
  events: EventRow[];
  isLoading?: boolean;
  onCancelEvent: (row: EventDisplayRow) => void;
  onEditEvent: (row: EventDisplayRow) => void;
  onSelectEvent: (row: EventDisplayRow) => void;
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
  const displayRows = useMemo(() => {
    const { start, end } = getDefaultDateRange();
    return buildEventDisplayRows(events, start, end);
  }, [events]);

  const columns = createEventsTableColumns({
    canManage,
    onCancelEvent,
    onEditEvent,
    onSelectEvent,
  });

  return (
    <DataTableWrapper<EventDisplayRow>
      columns={columns}
      data={displayRows}
      defaultColumnPinning={{ right: ["actions"] }}
      emptyMessage="No events found."
      getRowId={(row) => row.key}
      isLoading={isLoading}
      searchFn={searchDisplayRow}
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
