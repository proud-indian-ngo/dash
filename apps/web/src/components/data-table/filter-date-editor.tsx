import {
  resolveFilterDate,
  toFilterDateValue,
} from "@pi-dash/design-system/components/reui/filters/filters-date";
import type { FilterEditorProps } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { isFilterDateValue } from "@/components/data-table/filter-date";

interface CalendarRange {
  from: Date | undefined;
  to?: Date | undefined;
}

function toRange(value: unknown): CalendarRange | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const from = isFilterDateValue(value[0])
    ? (resolveFilterDate(value[0]) ?? undefined)
    : undefined;
  const to = isFilterDateValue(value[1])
    ? (resolveFilterDate(value[1]) ?? undefined)
    : undefined;
  if (!from) {
    return;
  }
  return { from, to };
}

function FilterDateRangeEditor({
  autoFocusProps,
  commit,
  onValueChange,
  value,
}: FilterEditorProps) {
  const handleSelect = useEventCallback((range: CalendarRange | undefined) => {
    const next = [
      range?.from ? toFilterDateValue(range.from) : undefined,
      range?.to ? toFilterDateValue(range.to) : undefined,
    ];
    onValueChange(next);
    if (range?.from && range.to) {
      commit(next);
    }
  });

  return (
    <div className="p-2" {...autoFocusProps}>
      <Calendar
        mode="range"
        onSelect={handleSelect}
        selected={toRange(value)}
      />
    </div>
  );
}

function FilterDateSingleEditor({
  autoFocusProps,
  commit,
  onValueChange,
  value,
}: FilterEditorProps) {
  const selected = isFilterDateValue(value)
    ? (resolveFilterDate(value) ?? undefined)
    : undefined;
  const handleSelect = useEventCallback((date?: Date) => {
    if (!date) {
      onValueChange(undefined);
      return;
    }
    const next = toFilterDateValue(date);
    onValueChange(next);
    commit(next);
  });

  return (
    <div className="p-2" {...autoFocusProps}>
      <Calendar mode="single" onSelect={handleSelect} selected={selected} />
    </div>
  );
}

export function FilterDateEditor(props: FilterEditorProps) {
  if (props.operator.arity === "range") {
    return <FilterDateRangeEditor {...props} />;
  }
  return <FilterDateSingleEditor {...props} />;
}

export const DATA_TABLE_FILTER_EDITORS = {
  date: FilterDateEditor,
};
