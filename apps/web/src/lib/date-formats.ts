import { format } from "date-fns";

// Date format constants
export const SHORT_DATE = "dd/MM/yyyy";
export const LONG_DATE = "MMMM d, yyyy";
export const SHORT_MONTH_DATE_TIME = "MMM d, yyyy h:mm a";
export const LONG_DATE_TIME = "PPP p";
export const LOCALE_DATE = "PP";
export const ISO_DATE = "yyyy-MM-dd";
export const ISO_DATETIME_LOCAL = "yyyy-MM-dd'T'HH:mm";
export const SHORT_DATE_WITH_TIME = "dd/MM/yyyy, HH:mm";
export const SHORT_DATE_WITH_SECONDS = "dd/MM/yyyy, HH:mm:ss";

// Epoch conversion utilities
export function epochToDatetimeLocal(epoch: number): string {
  return format(new Date(epoch), ISO_DATETIME_LOCAL);
}

export function datetimeLocalToEpoch(value: string): number {
  return new Date(value).getTime();
}
