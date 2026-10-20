import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

const startsFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/** "20 Oct 2026, 10:00 am", in India time. */
export function formatStartsAt(epoch: number | null | undefined): string {
  return epoch === null || epoch === undefined
    ? "—"
    : startsFmt.format(new Date(epoch));
}

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
});
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  weekday: "short",
});
const dayYearFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
  weekday: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** The meeting's day in India time, as an ISO date. */
export function meetingDay(epoch: number): string {
  return dayKeyFmt.format(new Date(epoch));
}

/** "Sat 10 Oct", with the year outside this year and Today/Tomorrow first. */
export function meetingDayHeading(epoch: number, now: number): string {
  const day = meetingDay(epoch);
  const sameYear = day.slice(0, 4) === meetingDay(now).slice(0, 4);
  const label = (sameYear ? dayFmt : dayYearFmt)
    .format(new Date(epoch))
    .replace(",", "");
  if (day === meetingDay(now)) {
    return `Today · ${label}`;
  }
  if (day === meetingDay(now + 86_400_000)) {
    return `Tomorrow · ${label}`;
  }
  return label;
}

/** "10:00 am", in India time. */
export function formatMeetingTime(epoch: number): string {
  return timeFmt.format(new Date(epoch));
}

/** One meeting with its agenda, attendance and votes, from Zero. */
export function useMeetingDetail(id: string) {
  return useQuery(queries.meeting.byId({ id }));
}

export type MeetingDetail = NonNullable<ReturnType<typeof useMeetingDetail>[0]>;
export type AgendaItemView = MeetingDetail["agenda"][number];
export type AttendanceView = MeetingDetail["attendance"][number];

/** The mutation's error message, for a toast. */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
