import {
  findOccurrence,
  parseRecurrenceRule,
  type VirtualOccurrence,
} from "@pi-dash/shared/rrule-expand";
import { uuidv7 } from "uuidv7";

/**
 * Interest requests from public-website sign-ups
 * (`/register?interestEventId=<id>[&occDate=]`). Unlike `?eventId=` (direct
 * enrollment for invite links), this only files a pending interest on a
 * public event for a team lead to approve. It runs when the new account
 * verifies its email, so leads never see unverified sign-ups. Interest is per
 * session: a recurring series' occurrence is materialized first.
 */

export type RegisterInterestSkipReason =
  | "missing"
  | "not-public"
  | "cancelled"
  | "started"
  | "needs-session"
  | "no-session";

export interface RegisterInterestEventRow {
  cancelledAt: number | null;
  endTime: number | null;
  id: string;
  isPublic: boolean;
  managementDomain: string | null;
  name: string;
  recurrenceRule: unknown;
  seriesId: string | null;
  startTime: number;
  teamId: string;
}

export interface RegisterInterestDeps {
  enqueueNotifyInterestReceived: (payload: {
    eventId: string;
    eventName: string;
    leadUserIds: string[];
    teamId: string;
    volunteerName: string;
  }) => Promise<void>;
  findEvent: (eventId: string) => Promise<RegisterInterestEventRow | null>;
  findTeamLeadIds: (teamId: string) => Promise<string[]>;
  insertPendingInterest: (row: {
    createdAt: number;
    eventId: string;
    id: string;
    userId: string;
  }) => Promise<"conflict" | "inserted">;
  /** Existing exception row for the date, or a newly materialized one. */
  materializeOccurrence: (input: {
    materializedId: string;
    now: number;
    occurrence: VirtualOccurrence;
    series: RegisterInterestEventRow;
    userId: string;
  }) => Promise<RegisterInterestEventRow | null>;
}

type Skip = { kind: "skip"; reason: RegisterInterestSkipReason };

/** Whether a single event row (one-off or session) is open for interest. */
export function decideInterestTarget(
  event: RegisterInterestEventRow | null,
  now: number
): { kind: "request" } | Skip {
  if (!event) {
    return { kind: "skip", reason: "missing" };
  }
  // Kalakriti runs its own registration and is not listed on the website.
  if (!event.isPublic || event.managementDomain === "kalakriti") {
    return { kind: "skip", reason: "not-public" };
  }
  if (event.cancelledAt !== null) {
    return { kind: "skip", reason: "cancelled" };
  }
  if (event.startTime <= now) {
    return { kind: "skip", reason: "started" };
  }
  return { kind: "request" };
}

/** Validate a series and its chosen date before materializing anything. */
export function decideSeriesOccurrence(
  series: RegisterInterestEventRow,
  occDate: string | undefined,
  now: number
): { kind: "occurrence"; occurrence: VirtualOccurrence } | Skip {
  if (!series.isPublic || series.managementDomain === "kalakriti") {
    return { kind: "skip", reason: "not-public" };
  }
  if (series.cancelledAt !== null) {
    return { kind: "skip", reason: "cancelled" };
  }
  const rule = parseRecurrenceRule(series.recurrenceRule ?? null);
  if (!rule) {
    return { kind: "skip", reason: "missing" };
  }
  if (!occDate) {
    return { kind: "skip", reason: "needs-session" };
  }
  const occurrence = findOccurrence(
    rule,
    series.startTime,
    series.endTime,
    occDate
  );
  if (!occurrence) {
    return { kind: "skip", reason: "no-session" };
  }
  if (occurrence.startTime <= now) {
    return { kind: "skip", reason: "started" };
  }
  return { kind: "occurrence", occurrence };
}

export async function requestInterestOnRegister(
  deps: RegisterInterestDeps,
  input: {
    eventId: string;
    now: number;
    occDate?: string;
    userId: string;
    userName: string;
  }
): Promise<{ reason?: RegisterInterestSkipReason; status: string }> {
  const skipped = (reason: RegisterInterestSkipReason) => ({
    reason,
    status: "skipped",
  });
  let event = await deps.findEvent(input.eventId);
  if (event && !event.seriesId && parseRecurrenceRule(event.recurrenceRule)) {
    const decision = decideSeriesOccurrence(event, input.occDate, input.now);
    if (decision.kind === "skip") {
      return skipped(decision.reason);
    }
    event = await deps.materializeOccurrence({
      materializedId: uuidv7(),
      now: input.now,
      occurrence: decision.occurrence,
      series: event,
      userId: input.userId,
    });
  }
  const decision = decideInterestTarget(event, input.now);
  if (decision.kind === "skip" || !event) {
    return skipped(decision.kind === "skip" ? decision.reason : "missing");
  }

  const result = await deps.insertPendingInterest({
    createdAt: input.now,
    eventId: event.id,
    id: uuidv7(),
    userId: input.userId,
  });
  if (result === "conflict") {
    return { status: "conflict" };
  }

  await deps.enqueueNotifyInterestReceived({
    eventId: event.id,
    eventName: event.name,
    leadUserIds: await deps.findTeamLeadIds(event.teamId),
    teamId: event.teamId,
    volunteerName: input.userName,
  });
  return { status: "requested" };
}
