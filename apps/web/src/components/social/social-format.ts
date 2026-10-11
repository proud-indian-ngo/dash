import { SOCIAL_TIMEZONE } from "@pi-dash/shared/social-api";

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "short",
  timeZone: SOCIAL_TIMEZONE,
  year: "numeric",
});

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Epoch milliseconds as India time, e.g. "11 Oct 2026, 10:30 IST". */
export function formatIndiaDateTime(epochMs: number): string {
  const parts = DATE_TIME.formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} IST`;
}

/** A YYYY-MM-DD calendar date, e.g. "18 Oct 2026"; anything else as given. */
export function formatCalendarDate(value: string): string {
  return ISO_DATE_RE.test(value)
    ? DATE.format(Date.parse(`${value}T00:00:00Z`))
    : value;
}

/** A social event id names a `team_event` row only when it is a bare uuid. */
export function isEventRowId(eventId: string): boolean {
  return UUID_RE.test(eventId);
}
