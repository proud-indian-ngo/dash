import { type ReactNode, useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { createEventsTableColumns } from "@/components/teams/events/events-table-columns";
import type {
  EventRow,
  ParentEventRow,
} from "@/components/teams/events/events-table-helpers";
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
  const parentRows = (() => {
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
  })();

  const columns = useMemo(
    () =>
      createEventsTableColumns({
        canManage,
        onCancelEvent,
        onEditEvent,
        onSelectEvent,
      }),
    [canManage, onCancelEvent, onEditEvent, onSelectEvent]
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
