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
