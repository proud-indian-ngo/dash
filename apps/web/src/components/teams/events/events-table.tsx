import type { ReactNode } from "react";
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
  canCancelPast: boolean;
  canCreate: boolean;
  canManage: boolean;
  displayRowFilter?: (row: EventDisplayRow) => boolean;
  events: EventRow[];
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onCancelEvent: (row: EventDisplayRow) => void;
  onClearFilters?: () => void;
  onDuplicateEvent: (row: EventDisplayRow) => void;
  onEditEvent: (row: EventDisplayRow) => void;
  onSelectEvent: (row: EventDisplayRow) => void;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
}

export function EventsTable({
  events,
  canCancelPast,
  canCreate,
  canManage,
  displayRowFilter,
  isLoading,
  onSelectEvent,
  onEditEvent,
  onDuplicateEvent,
  onCancelEvent,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: EventsTableProps) {
  const { start, end } = getDefaultDateRange();
  const allDisplayRows = buildEventDisplayRows(events, start, end);

  const displayRows = displayRowFilter
    ? allDisplayRows.filter(displayRowFilter)
    : allDisplayRows;

  const columns = createEventsTableColumns({
    canCancelPast,
    canCreate,
    canManage,
    onCancelEvent,
    onDuplicateEvent,
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
      hasActiveFilters={hasActiveFilters}
      isLoading={isLoading}
      onClearFilters={onClearFilters}
      onRowClick={onSelectEvent}
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
      toolbarFilters={toolbarFilters}
    />
  );
}
