import { endOfMonth, startOfMonth, subDays, subMonths } from "date-fns";
import { parseAsString } from "nuqs";

function fiscalYearStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 3, 1);
}

export type PresetKey =
  | "7d"
  | "30d"
  | "this_month"
  | "3m"
  | "fiscal_year"
  | "all";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface Preset {
  getRange: () => DateRange;
  key: PresetKey;
  label: string;
}

export const DATE_PRESETS: Preset[] = [
  {
    key: "all",
    label: "All time",
    getRange: () => ({ from: null, to: null }),
  },
  {
    key: "7d",
    label: "Last 7 days",
    getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    key: "30d",
    label: "Last 30 days",
    getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    key: "this_month",
    label: "This month",
    getRange: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
  {
    key: "3m",
    label: "Last 3 months",
    getRange: () => ({ from: subMonths(new Date(), 3), to: new Date() }),
  },
  {
    key: "fiscal_year",
    label: "This fiscal year",
    getRange: () => ({ from: fiscalYearStart(), to: new Date() }),
  },
];

export const dateRangeSearchParams = {
  range: parseAsString.withDefault("all"),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
};

export function resolveDateRange(
  rangeKey: string,
  fromStr: string,
  toStr: string
): DateRange {
  if (rangeKey === "custom" && fromStr && toStr) {
    return { from: new Date(fromStr), to: new Date(toStr) };
  }
  const preset = DATE_PRESETS.find((p) => p.key === rangeKey);
  return preset ? preset.getRange() : { from: null, to: null };
}

export function filterByDateRange<T>(
  items: readonly T[],
  range: DateRange,
  dateAccessor: (item: T) => number | null = (item) =>
    (item as Record<string, unknown>).createdAt as number | null
): T[] {
  const { from, to } = range;
  if (!(from || to)) {
    return [...items];
  }

  const fromMs = from ? from.getTime() : 0;
  const toMs = to ? to.getTime() : Number.POSITIVE_INFINITY;

  return items.filter((item) => {
    const ts = dateAccessor(item);
    if (ts == null) {
      return false;
    }
    return ts >= fromMs && ts <= toMs;
  });
}
