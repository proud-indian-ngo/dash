import {
  type FilterDateValue,
  formatFilterDate,
  resolveFilterDate,
  toFilterDateValue,
} from "@pi-dash/design-system/components/reui/filters/filters-date";
import type {
  FilterEditorProps,
  FilterOperator,
  FilterValueDisplayContext,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Calendar } from "@pi-dash/design-system/components/ui/calendar";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

interface CalendarRange {
  from: Date | undefined;
  to?: Date | undefined;
}

export const DATE_FILTER_OPERATORS: FilterOperator[] = [
  { arity: "one", inverse: "is_not", label: "is", value: "is" },
  { arity: "one", inverse: "is", label: "is not", value: "is_not" },
  { arity: "one", label: "is before", value: "is_before" },
  { arity: "one", label: "is after", value: "is_after" },
  {
    arity: "range",
    inverse: "not_between",
    label: "is between",
    value: "between",
  },
  {
    arity: "range",
    inverse: "between",
    label: "is not between",
    value: "not_between",
  },
  { arity: "none", inverse: "not_empty", label: "is empty", value: "empty" },
  {
    arity: "none",
    inverse: "empty",
    label: "is not empty",
    value: "not_empty",
  },
];

function isFilterDateValue(value: unknown): value is FilterDateValue {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as FilterDateValue;
  return (
    typeof candidate.date === "string" ||
    (candidate.relative !== undefined &&
      typeof candidate.relative.unit === "string")
  );
}

export function filterDateValueText(
  context: FilterValueDisplayContext
): string {
  const { value } = context;
  if (Array.isArray(value)) {
    const from = isFilterDateValue(value[0]) ? formatFilterDate(value[0]) : "";
    const to = isFilterDateValue(value[1]) ? formatFilterDate(value[1]) : "";
    return [from, to].filter(Boolean).join(" – ");
  }
  if (isFilterDateValue(value)) {
    return formatFilterDate(value);
  }
  return "";
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
