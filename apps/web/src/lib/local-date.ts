import { format } from "date-fns";

/**
 * Postgres `date` columns reach the browser through Zero as the epoch of UTC
 * midnight. These helpers move between that and the local calendar day a
 * date picker works with, without shifting the day in any timezone.
 */
export function epochToLocalDate(
  value: number | null | undefined
): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const [y, m, d] = new Date(value).toISOString().slice(0, 10).split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** The ISO calendar day (yyyy-MM-dd) of a local Date, or null when unset. */
export function localDateToIso(value: Date | undefined): string | null {
  return value ? format(value, "yyyy-MM-dd") : null;
}
