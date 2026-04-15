import type { City, EventType } from "@pi-dash/shared/constants";
import type { TeamEvent } from "../schema";
import { zql } from "../schema";

const UNTIL_RE = /UNTIL=[^;]+/;
const DASH_RE = /-/g;

/** Build a truncated RRULE string with UNTIL set to the day before splitDate. */
export function buildTruncatedRRule(
  rruleStr: string,
  splitIsoDate: string
): string {
  const splitDate = new Date(`${splitIsoDate}T00:00:00Z`);
  splitDate.setUTCDate(splitDate.getUTCDate() - 1);
  const untilStr = splitDate.toISOString().slice(0, 10).replace(DASH_RE, "");
  if (rruleStr.includes("UNTIL=")) {
    return rruleStr.replace(UNTIL_RE, `UNTIL=${untilStr}T235959Z`);
  }
  return `${rruleStr};UNTIL=${untilStr}T235959Z`;
}

export type RecurrenceRuleValue = {
  rrule: string;
  exdates?: string[];
} | null;

/** Build an exception insert payload inheriting from the series parent. */
export function buildExceptionInsert(
  id: string,
  series: TeamEvent,
  originalDate: string,
  createdBy: string,
  now: number,
  overrides: Partial<{
    name: string;
    description: string;
    location: string;
    startTime: number;
    endTime: number;
    isPublic: boolean;
    feedbackEnabled: boolean;
    feedbackDeadline: number | null;
    postRsvpPoll: boolean;
    rsvpPollLeadMinutes: number;
    reminderIntervals: number[] | null;
    whatsappGroupId: string;
    cancelledAt: number | null;
  }> = {}
) {
  return {
    id,
    teamId: series.teamId,
    type: series.type,
    name: overrides.name ?? series.name,
    description: overrides.description ?? series.description ?? null,
    location: overrides.location ?? series.location ?? null,
    city: series.city,
    startTime: overrides.startTime ?? series.startTime,
    endTime: overrides.endTime ?? series.endTime ?? null,
    isPublic: overrides.isPublic ?? series.isPublic,
    recurrenceRule: null,
    seriesId: series.id,
    originalDate,
    cancelledAt: overrides.cancelledAt ?? null,
    feedbackEnabled: overrides.feedbackEnabled ?? series.feedbackEnabled,
    feedbackDeadline:
      overrides.feedbackDeadline ?? series.feedbackDeadline ?? null,
    postRsvpPoll: overrides.postRsvpPoll ?? series.postRsvpPoll,
    rsvpPollLeadMinutes:
      overrides.rsvpPollLeadMinutes ?? series.rsvpPollLeadMinutes,
    reminderIntervals:
      overrides.reminderIntervals ?? series.reminderIntervals ?? null,
    whatsappGroupId:
      overrides.whatsappGroupId ?? series.whatsappGroupId ?? null,
    centerId: series.centerId,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateArgs {
  centerId?: string | null;
  city?: City;
  description?: string;
  endTime?: number;
  feedbackDeadline?: number | null;
  feedbackEnabled?: boolean;
  id: string;
  isPublic?: boolean;
  location?: string;
  name?: string;
  now: number;
  postRsvpPoll?: boolean;
  reminderIntervals?: number[] | null;
  rsvpPollLeadMinutes?: number;
  startTime?: number;
  type?: EventType;
  whatsappGroupId?: string;
}

/**
 * Conditionally include a field in an update payload only if the value is defined.
 * For nullable fields, pass a coerce function (`toNullIfFalsy` or `toNullIfNullish`)
 * to ensure correct null handling — omitting coerce sends the raw value.
 */
function setIfDefined<K extends string, V, R = V>(
  key: K,
  value: V | undefined,
  coerce?: (v: V) => R
): Record<K, R> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return { [key]: coerce ? coerce(value) : value } as Record<K, R>;
}

/** Coerce falsy values (empty string, 0, false) to null. */
export function toNullIfFalsy<T>(v: T): T | null {
  return v || null;
}

/** Coerce null/undefined to null, preserving other falsy values. */
export function toNullIfNullish<T>(v: T): T | null {
  return v ?? null;
}

export function buildUpdateFields(args: UpdateArgs) {
  return {
    id: args.id,
    ...setIfDefined("name", args.name),
    ...setIfDefined("description", args.description, toNullIfFalsy),
    ...setIfDefined("location", args.location, toNullIfFalsy),
    ...setIfDefined("city", args.city),
    ...setIfDefined("startTime", args.startTime),
    ...setIfDefined("endTime", args.endTime),
    ...setIfDefined("isPublic", args.isPublic),
    ...setIfDefined("feedbackEnabled", args.feedbackEnabled),
    ...setIfDefined("feedbackDeadline", args.feedbackDeadline, toNullIfNullish),
    ...setIfDefined("postRsvpPoll", args.postRsvpPoll),
    ...setIfDefined("rsvpPollLeadMinutes", args.rsvpPollLeadMinutes),
    ...setIfDefined(
      "reminderIntervals",
      args.reminderIntervals,
      toNullIfNullish
    ),
    ...setIfDefined("whatsappGroupId", args.whatsappGroupId, toNullIfFalsy),
    ...setIfDefined("type", args.type),
    ...setIfDefined("centerId", args.centerId, toNullIfNullish),
    updatedAt: args.now,
  };
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Structural type for the tx parameter from defineMutator.
// Catches typos (tx.mutat) while avoiding dependency on Zero's deep internal types.
export interface Tx {
  location: string;
  mutate: {
    teamEvent: {
      delete: (args: { id: string }) => Promise<void>;
      // biome-ignore lint/suspicious/noExplicitAny: row shapes vary per call and can't be expressed without Zero's generic
      insert: (args: any) => Promise<void>;
      // biome-ignore lint/suspicious/noExplicitAny: same as above
      update: (args: any) => Promise<void>;
    };
    classEventStudent: {
      // biome-ignore lint/suspicious/noExplicitAny: row shapes vary per call
      insert: (args: any) => Promise<void>;
    };
  };
  // biome-ignore lint/suspicious/noExplicitAny: Zero's Query type is deeply generic
  run: (query: any) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// updateSeries per-mode helpers
// ---------------------------------------------------------------------------

export async function updateSeriesAll(
  tx: Tx,
  args: { id: string; now: number; recurrenceRule?: RecurrenceRuleValue },
  updateFields: ReturnType<typeof buildUpdateFields>
) {
  await tx.mutate.teamEvent.update({
    ...updateFields,
    ...(args.recurrenceRule !== undefined && {
      recurrenceRule: args.recurrenceRule ?? null,
    }),
  });
}

export async function updateSeriesThis(
  tx: Tx,
  args: {
    id: string;
    now: number;
    originalDate?: string;
    newExceptionId?: string;
    name?: string;
    description?: string;
    location?: string;
    startTime?: number;
    endTime?: number;
    isPublic?: boolean;
    feedbackEnabled?: boolean;
    feedbackDeadline?: number | null;
    postRsvpPoll?: boolean;
    rsvpPollLeadMinutes?: number;
    reminderIntervals?: number[] | null;
    whatsappGroupId?: string;
  },
  existing: TeamEvent,
  userId: string
) {
  if (existing.seriesId) {
    await tx.mutate.teamEvent.update(buildUpdateFields(args));
  } else if (
    existing.recurrenceRule &&
    args.originalDate &&
    args.newExceptionId
  ) {
    await tx.mutate.teamEvent.insert(
      buildExceptionInsert(
        args.newExceptionId,
        existing,
        args.originalDate,
        userId,
        args.now,
        {
          name: args.name,
          description: args.description,
          location: args.location,
          startTime: args.startTime,
          endTime: args.endTime,
          isPublic: args.isPublic,
          feedbackEnabled: args.feedbackEnabled,
          feedbackDeadline: args.feedbackDeadline ?? undefined,
          postRsvpPoll: args.postRsvpPoll,
          rsvpPollLeadMinutes: args.rsvpPollLeadMinutes,
          reminderIntervals: args.reminderIntervals ?? undefined,
          whatsappGroupId: args.whatsappGroupId,
        }
      )
    );
  }
}

export async function updateSeriesFollowing(
  tx: Tx,
  args: {
    id: string;
    now: number;
    originalDate: string;
    newSeriesId: string;
    name?: string;
    description?: string;
    location?: string;
    startTime?: number;
    endTime?: number;
    isPublic?: boolean;
    feedbackEnabled?: boolean;
    feedbackDeadline?: number | null;
    postRsvpPoll?: boolean;
    rsvpPollLeadMinutes?: number;
    reminderIntervals?: number[] | null;
    whatsappGroupId?: string;
    recurrenceRule?: RecurrenceRuleValue;
  },
  existing: TeamEvent,
  userId: string,
  generateId?: () => string
) {
  if (!existing.recurrenceRule) {
    throw new Error("Cannot split a non-recurring event");
  }
  const rule = existing.recurrenceRule as RecurrenceRuleValue & {
    rrule: string;
  };
  await tx.mutate.teamEvent.update({
    id: args.id,
    recurrenceRule: {
      ...rule,
      rrule: buildTruncatedRRule(rule.rrule, args.originalDate),
    },
    updatedAt: args.now,
  });
  const newRule = args.recurrenceRule ?? { rrule: rule.rrule };
  await tx.mutate.teamEvent.insert({
    id: args.newSeriesId,
    teamId: existing.teamId,
    type: existing.type,
    name: args.name ?? existing.name,
    description: args.description ?? existing.description ?? null,
    location: args.location ?? existing.location ?? null,
    city: existing.city,
    startTime: args.startTime ?? existing.startTime,
    endTime: args.endTime ?? existing.endTime ?? null,
    isPublic: args.isPublic ?? existing.isPublic,
    recurrenceRule: newRule,
    seriesId: null,
    originalDate: null,
    cancelledAt: null,
    feedbackEnabled: args.feedbackEnabled ?? existing.feedbackEnabled,
    feedbackDeadline:
      args.feedbackDeadline ?? existing.feedbackDeadline ?? null,
    postRsvpPoll: args.postRsvpPoll ?? existing.postRsvpPoll,
    rsvpPollLeadMinutes:
      args.rsvpPollLeadMinutes ?? existing.rsvpPollLeadMinutes,
    reminderIntervals:
      args.reminderIntervals ?? existing.reminderIntervals ?? null,
    whatsappGroupId: args.whatsappGroupId ?? existing.whatsappGroupId ?? null,
    centerId: existing.centerId,
    createdBy: userId,
    createdAt: args.now,
    updatedAt: args.now,
  });

  // Copy student enrollment from old series to new series (for class events)
  if (existing.type === "class" && generateId) {
    await copyClassEventStudents(tx, args.id, args.newSeriesId, generateId);
  }
}

/** Copy classEventStudent enrollment rows from one event to another. */
export async function copyClassEventStudents(
  tx: Tx,
  sourceEventId: string,
  targetEventId: string,
  generateId: () => string
) {
  const students = (await tx.run(
    zql.classEventStudent.where("eventId", sourceEventId)
  )) as { studentId: string }[];
  for (const s of students) {
    await tx.mutate.classEventStudent.insert({
      id: generateId(),
      eventId: targetEventId,
      studentId: s.studentId,
      attendance: null,
      attendanceMarkedAt: null,
      attendanceMarkedBy: null,
    });
  }
}

// ---------------------------------------------------------------------------
// cancelSeries per-mode helpers
// ---------------------------------------------------------------------------

export async function cancelSeriesAll(
  tx: Tx,
  args: { id: string; now: number }
) {
  await tx.mutate.teamEvent.update({
    id: args.id,
    cancelledAt: args.now,
    updatedAt: args.now,
  });
  const exceptions = (await tx.run(
    zql.teamEvent.where("seriesId", args.id)
  )) as TeamEvent[];
  for (const exc of exceptions) {
    if (!exc.cancelledAt) {
      await tx.mutate.teamEvent.update({
        id: exc.id,
        cancelledAt: args.now,
        updatedAt: args.now,
      });
    }
  }
}

export async function cancelSeriesThis(
  tx: Tx,
  args: {
    id: string;
    now: number;
    originalDate?: string;
    newExceptionId?: string;
  },
  existing: TeamEvent,
  userId: string
) {
  if (existing.seriesId || !existing.recurrenceRule) {
    await tx.mutate.teamEvent.update({
      id: args.id,
      cancelledAt: args.now,
      updatedAt: args.now,
    });
  } else if (args.originalDate && args.newExceptionId) {
    await tx.mutate.teamEvent.insert(
      buildExceptionInsert(
        args.newExceptionId,
        existing,
        args.originalDate,
        userId,
        args.now,
        { cancelledAt: args.now }
      )
    );
  }
}

export async function cancelSeriesFollowing(
  tx: Tx,
  args: { id: string; now: number; originalDate: string },
  existing: TeamEvent
) {
  if (!existing.recurrenceRule) {
    throw new Error("Cannot truncate a non-recurring event");
  }
  const rule = existing.recurrenceRule as RecurrenceRuleValue & {
    rrule: string;
  };
  await tx.mutate.teamEvent.update({
    id: args.id,
    recurrenceRule: {
      ...rule,
      rrule: buildTruncatedRRule(rule.rrule, args.originalDate),
    },
    updatedAt: args.now,
  });
  const exceptions = (await tx.run(
    zql.teamEvent.where("seriesId", args.id)
  )) as TeamEvent[];
  for (const exc of exceptions) {
    if (
      exc.originalDate &&
      exc.originalDate >= args.originalDate &&
      !exc.cancelledAt
    ) {
      await tx.mutate.teamEvent.update({
        id: exc.id,
        cancelledAt: args.now,
        updatedAt: args.now,
      });
    }
  }
}
