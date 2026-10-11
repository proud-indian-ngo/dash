import { format } from "date-fns";

// Display formats. One style everywhere, matching the en-IN output Kalakriti
// uses: "16 Oct 2026", "16 Oct 2026, 9:40 am". Use ISO_DATE only for keys,
// URLs and input values, never for display.
export const DATE = "d MMM yyyy";
export const DATE_TIME = "d MMM yyyy, h:mm aaa";
export const DATE_TIME_SECONDS = "d MMM yyyy, h:mm:ss aaa";
export const DAY_MONTH = "d MMM";
export const DAY_MONTH_TIME = "d MMM, h:mm aaa";
export const TIME = "h:mm aaa";
export const ISO_DATE = "yyyy-MM-dd";

/** Lists show minutes; pass `seconds` where precision matters (audit, jobs). */
export function formatTimestamp(
  value: string | null | undefined,
  {
    fallback = "\u2014",
    seconds = false,
  }: { fallback?: string; seconds?: boolean } = {}
): string {
  if (!value) {
    return fallback;
  }
  try {
    return format(new Date(value), seconds ? DATE_TIME_SECONDS : DATE_TIME);
  } catch {
    return value;
  }
}
