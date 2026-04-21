import type { City, ReminderTarget } from "@pi-dash/shared/constants";
import type { TeamEvent } from "../schema";
import { zql } from "../schema";

const UNTIL_RE = /UNTIL=\d{8}T\d{6}Z/;
const DASH_RE = /-/g;

/**
 * Build a truncated RRULE string with UNTIL pinned to 00:00:00Z of splitDate.
 * Any occurrence at or after splitDate (UTC) is excluded; earlier occurrences
 * stay on the old series. TZ-clean regardless of the series' wall-clock time.
 */
export function buildTruncatedRRule(
  rruleStr: string,
  splitIsoDate: string
): string {
  const untilStr = splitIsoDate.replace(DASH_RE, "");
  const until = `UNTIL=${untilStr}T000000Z`;
  if (rruleStr.includes("UNTIL=")) {
    return rruleStr.replace(UNTIL_RE, until);
  }
  return `${rruleStr};${until}`;
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
    postEventNudgesEnabled: boolean;
    reminderIntervals: number[] | null;
    reminderTarget: string;
    whatsappGroupId: string;
    inheritVolunteers: boolean;
    cancelledAt: number | null;
  }> = {}
) {
  return {
    id,
    teamId: series.teamId,
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
    reminderTarget:
      overrides.reminderTarget ?? series.reminderTarget ?? "group",
    postEventNudgesEnabled:
      overrides.postEventNudgesEnabled ?? series.postEventNudgesEnabled,
    whatsappGroupId:
      overrides.whatsappGroupId ?? series.whatsappGroupId ?? null,
    inheritVolunteers:
      overrides.inheritVolunteers ?? series.inheritVolunteers ?? false,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateArgs {
  city?: City;
  description?: string;
  endTime?: number;
  feedbackDeadline?: number | null;
  feedbackEnabled?: boolean;
  id: string;
  inheritVolunteers?: boolean;
  isPublic?: boolean;
  location?: string;
  name?: string;
  now: number;
  postEventNudgesEnabled?: boolean;
  postRsvpPoll?: boolean;
  reminderIntervals?: number[] | null;
  reminderTarget?: ReminderTarget;
  rsvpPollLeadMinutes?: number;
  startTime?: number;
  whatsappGroupId?: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one conditional spread per optional field
export function buildUpdateFields(args: UpdateArgs) {
  return {
    id: args.id,
    ...(args.name !== undefined && { name: args.name }),
    ...(args.description !== undefined && {
      description: args.description || null,
    }),
    ...(args.location !== undefined && { location: args.location || null }),
    ...(args.city !== undefined && { city: args.city }),
    ...(args.startTime !== undefined && { startTime: args.startTime }),
    ...(args.endTime !== undefined && { endTime: args.endTime }),
    ...(args.isPublic !== undefined && { isPublic: args.isPublic }),
    ...(args.feedbackEnabled !== undefined && {
      feedbackEnabled: args.feedbackEnabled,
    }),
    ...(args.feedbackDeadline !== undefined && {
      feedbackDeadline: args.feedbackDeadline ?? null,
    }),
    ...(args.postRsvpPoll !== undefined && {
      postRsvpPoll: args.postRsvpPoll,
    }),
    ...(args.rsvpPollLeadMinutes !== undefined && {
      rsvpPollLeadMinutes: args.rsvpPollLeadMinutes,
    }),
    ...(args.reminderIntervals !== undefined && {
      reminderIntervals: args.reminderIntervals ?? null,
    }),
    ...(args.reminderTarget !== undefined && {
      reminderTarget: args.reminderTarget,
    }),
    ...(args.postEventNudgesEnabled !== undefined && {
      postEventNudgesEnabled: args.postEventNudgesEnabled,
    }),
    ...(args.inheritVolunteers !== undefined && {
      inheritVolunteers: args.inheritVolunteers,
    }),
    ...(args.whatsappGroupId !== undefined && {
      whatsappGroupId: args.whatsappGroupId || null,
    }),
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
    teamEventMember: {
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
    postEventNudgesEnabled?: boolean;
    reminderIntervals?: number[] | null;
    reminderTarget?: ReminderTarget;
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
          postEventNudgesEnabled: args.postEventNudgesEnabled,
          reminderIntervals: args.reminderIntervals ?? undefined,
          reminderTarget: args.reminderTarget,
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
    postEventNudgesEnabled?: boolean;
    reminderIntervals?: number[] | null;
    reminderTarget?: ReminderTarget;
    whatsappGroupId?: string;
    inheritVolunteers?: boolean;
    recurrenceRule?: RecurrenceRuleValue;
  },
  existing: TeamEvent,
  userId: string
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
    reminderTarget: args.reminderTarget ?? existing.reminderTarget ?? "group",
    postEventNudgesEnabled:
      args.postEventNudgesEnabled ?? existing.postEventNudgesEnabled,
    whatsappGroupId: args.whatsappGroupId ?? existing.whatsappGroupId ?? null,
    inheritVolunteers:
      args.inheritVolunteers ?? existing.inheritVolunteers ?? false,
    createdBy: userId,
    createdAt: args.now,
    updatedAt: args.now,
  });
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
