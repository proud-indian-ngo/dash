import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  dateField,
  numberField,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import type { EventDisplayRow } from "@/components/teams/events/events-table-helpers";
import { getEventStatusKey } from "@/components/teams/events/events-table-helpers";
import { cityOptions } from "@/lib/form-schemas";

const EVENT_STATUS_OPTIONS = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
  { label: "Cancelled", value: "cancelled" },
];
const EVENT_VISIBILITY_OPTIONS = [
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
];
const EVENT_RECURRENCE_OPTIONS = [
  { label: "One-time", value: "one-time" },
  { label: "Recurring", value: "recurring" },
];

const LEGACY_EVENT_FILTER_PARAMS = [
  { param: "evStatus", path: "status" },
  { param: "evVis", path: "visibility" },
  { param: "evRec", path: "recurrence" },
] as const;

export function getEventFilterValue(
  row: EventDisplayRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "city":
      return row.event.city;
    case "members":
      return row.members.length;
    case "recurrence":
      return row.event.recurrenceRule ? "recurring" : "one-time";
    case "startTime":
      return row.startTime;
    case "status":
      return getEventStatusKey(row);
    case "visibility":
      return row.event.isPublic ? "public" : "private";
    default:
      return;
  }
}

export function createEventFilterFields(): FilterField[] {
  return [
    selectField("status", "Status", EVENT_STATUS_OPTIONS),
    selectField("visibility", "Visibility", EVENT_VISIBILITY_OPTIONS),
    selectField("recurrence", "Recurrence", EVENT_RECURRENCE_OPTIONS),
    selectField("city", "City", cityOptions),
    dateField("startTime", "Date/Time"),
    numberField("members", "Volunteers"),
  ];
}

export function useMigrateLegacyEventFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_EVENT_FILTER_PARAMS);
}
