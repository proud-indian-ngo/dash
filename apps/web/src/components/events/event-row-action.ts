import type { EventInterest } from "@pi-dash/zero/schema";
import { format } from "date-fns";

import { DAY_MONTH } from "@/lib/date-formats";

const DAY_MS = 24 * 60 * 60 * 1000;

type CardActionState =
  | { kind: "joined" }
  | { kind: "interestPending"; interestId: string; started: boolean }
  | { kind: "interestApproved" }
  | { kind: "interestDeclined" }
  | { kind: "interestNotReviewed" }
  | { kind: "join" }
  | { kind: "showInterest" }
  | { kind: "none" };

export function deriveCardActionState(opts: {
  isMember: boolean;
  interest: Pick<EventInterest, "id" | "status"> | undefined;
  hasStarted: boolean;
  canManageInterest: boolean;
  isOwnTeam: boolean;
  isPublic: boolean | null;
}): CardActionState {
  if (opts.isMember) {
    return { kind: "joined" };
  }
  if (opts.interest) {
    if (opts.interest.status === "pending") {
      return {
        interestId: opts.interest.id,
        kind: "interestPending",
        started: opts.hasStarted,
      };
    }
    if (opts.interest.status === "approved") {
      return { kind: "interestApproved" };
    }
    if (opts.interest.status === "rejected") {
      return { kind: "interestDeclined" };
    }
    // Closed by the daily job: the event started before anyone reviewed it.
    if (opts.interest.status === "expired") {
      return { kind: "interestNotReviewed" };
    }
  }
  if (opts.hasStarted || opts.canManageInterest) {
    return { kind: "none" };
  }
  if (opts.isOwnTeam) {
    return { kind: "join" };
  }
  if (opts.isPublic) {
    return { kind: "showInterest" };
  }
  return { kind: "none" };
}

const FREQ_LABELS: Record<string, [single: string, unit: string]> = {
  DAILY: ["Daily", "days"],
  MONTHLY: ["Monthly", "months"],
  WEEKLY: ["Weekly", "weeks"],
  YEARLY: ["Yearly", "years"],
};

/** A short repeat label for a row ("Weekly", "Every 2 weeks"), or null. */
export function recurrenceTag(rrule: string | null): string | null {
  if (!rrule) {
    return null;
  }
  const freq = /FREQ=([A-Z]+)/.exec(rrule)?.[1];
  const labels = freq ? FREQ_LABELS[freq] : undefined;
  if (!labels) {
    return "Recurring";
  }
  const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1);
  return interval > 1 ? `Every ${interval} ${labels[1]}` : labels[0];
}

/**
 * The line under a row's start time: the length for anything under a day,
 * "to 22 Oct" for multi-day events, and nothing when the end isn't after the
 * start (open-ended events end when they start).
 */
export function eventEndLabel(
  startTime: number,
  endTime: number | null
): string | null {
  if (endTime === null || endTime <= startTime) {
    return null;
  }
  return endTime - startTime < DAY_MS
    ? formatDuration(endTime - startTime)
    : `to ${format(endTime, DAY_MONTH)}`;
}

/**
 * Pending interest requests per event, for the reviewer badge. Only events
 * that haven't started count: once one starts its requests can't be reviewed.
 */
export function countReviewableInterests(
  interests: readonly {
    event?: { startTime: number } | null;
    eventId: string;
  }[],
  now: number
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const interest of interests) {
    if (!interest.event || interest.event.startTime <= now) {
      continue;
    }
    counts.set(interest.eventId, (counts.get(interest.eventId) ?? 0) + 1);
  }
  return counts;
}

/** "45 min", "2 hr", "1 hr 30 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
