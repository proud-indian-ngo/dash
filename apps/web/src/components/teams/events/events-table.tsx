import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  createEventFilterFields,
  getEventFilterValue,
  useMigrateLegacyEventFilterParams,
} from "@/components/teams/events/event-filters";
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
  events: EventRow[];
  isLoading?: boolean;
  onCancelEvent: (row: EventDisplayRow) => void;
  onDuplicateEvent: (row: EventDisplayRow) => void;
  onEditEvent: (row: EventDisplayRow) => void;
  onSelectEvent: (row: EventDisplayRow) => void;
  toolbarActions?: ReactNode;
}

export function EventsTable({
  events,
  canCancelPast,
  canCreate,
  canManage,
  isLoading,
  onSelectEvent,
  onEditEvent,
  onDuplicateEvent,
  onCancelEvent,
  toolbarActions,
}: EventsTableProps) {
  useMigrateLegacyEventFilterParams();
  const { end } = getDefaultDateRange();
  const displayRows = buildEventDisplayRows(events, end);

  const columns = createEventsTableColumns({
    canCancelPast,
    canCreate,
    canManage,
    onCancelEvent,
    onDuplicateEvent,
    onEditEvent,
    onSelectEvent,
  });
  const stableGetRowId0 = useEventCallback((row: { key: string }) => row.key);

  return (
    <DataTableWrapper<EventDisplayRow>
      columns={columns}
      data={displayRows}
      defaultColumnPinning={{ end: ["actions"], start: [] }}
      emptyMessage="No events found."
      filter={{
        fields: createEventFilterFields(),
        getValue: getEventFilterValue,
      }}
      getRowId={stableGetRowId0}
      isLoading={isLoading}
      onRowClick={onSelectEvent}
      searchFn={searchDisplayRow}
      searchPlaceholder="Search events..."
      storageKey="events_table_state_v2"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
