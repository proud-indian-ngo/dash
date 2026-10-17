import type { ReminderTarget } from "@pi-dash/shared/constants";
import { seriesStartDate } from "@pi-dash/shared/rrule-expand";

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
    publicArea: string;
    startTime: number;
    endTime: number;
    isPublic: boolean;
    feedbackEnabled: boolean;
    feedbackDeadline: number | null;
    postRsvpPoll: boolean;
    rsvpPollLeadMinutes: number;
    postEventNudgesEnabled: boolean;
    costCentreId: string;
    programmeId: string;
    reminderIntervals: number[] | null;
    reminderTarget: string;
    whatsappGroupId: string | null;
    inheritVolunteers: boolean;
    cancelledAt: number | null;
    volunteersNeeded: number | null;
  }> = {}
) {
  return {
    cancelledAt: overrides.cancelledAt ?? null,
    costCentreId: overrides.costCentreId ?? series.costCentreId,
    createdAt: now,
    createdBy,
    description: overrides.description ?? series.description ?? null,
    endTime: overrides.endTime ?? series.endTime ?? null,
    feedbackDeadline:
      overrides.feedbackDeadline ?? series.feedbackDeadline ?? null,
    feedbackEnabled: overrides.feedbackEnabled ?? series.feedbackEnabled,
    id,
    inheritVolunteers:
      overrides.inheritVolunteers ?? series.inheritVolunteers ?? false,
    isPublic: overrides.isPublic ?? series.isPublic,
    location: overrides.location ?? series.location ?? null,
    managementDomain: series.managementDomain,
    name: overrides.name ?? series.name,
    originalDate,
    postEventNudgesEnabled:
      overrides.postEventNudgesEnabled ?? series.postEventNudgesEnabled,
    postRsvpPoll: overrides.postRsvpPoll ?? series.postRsvpPoll,
    programmeId: overrides.programmeId ?? series.programmeId,
    // A cleared area ("") stores null, so the session shows the series' area.
    publicArea:
      overrides.publicArea === undefined
        ? (series.publicArea ?? null)
        : overrides.publicArea || null,
    recurrenceRule: null,
    reminderIntervals:
      overrides.reminderIntervals ?? series.reminderIntervals ?? null,
    reminderTarget:
      overrides.reminderTarget ?? series.reminderTarget ?? "group",
    rsvpPollLeadMinutes:
      overrides.rsvpPollLeadMinutes ?? series.rsvpPollLeadMinutes,
    seriesId: series.id,
    startTime: overrides.startTime ?? series.startTime,
    teamId: series.teamId,
    updatedAt: now,
    // Null inherits the parent's figure in the social API.
    volunteersNeeded: overrides.volunteersNeeded ?? null,
    // Undefined inherits the series' group; null or "" means none.
    whatsappGroupId:
      overrides.whatsappGroupId === undefined
        ? (series.whatsappGroupId ?? null)
        : overrides.whatsappGroupId || null,
  };
}

export interface UpdateArgs {
  costCentreId?: string;
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
  programmeId?: string;
  publicArea?: string;
  reminderIntervals?: number[] | null;
  reminderTarget?: ReminderTarget;
  rsvpPollLeadMinutes?: number;
  startTime?: number;
  volunteersNeeded?: number | null;
  whatsappGroupId?: string | null;
}

export function buildUpdateFields(args: UpdateArgs) {
  return {
    id: args.id,
    ...(args.name !== undefined && { name: args.name }),
    ...(args.description !== undefined && {
      description: args.description || null,
    }),
    ...(args.location !== undefined && { location: args.location || null }),
    ...(args.publicArea !== undefined && {
      publicArea: args.publicArea || null,
    }),
    ...(args.costCentreId !== undefined && {
      costCentreId: args.costCentreId,
    }),
    ...(args.programmeId !== undefined && { programmeId: args.programmeId }),
    ...(args.startTime !== undefined && { startTime: args.startTime }),
    ...(args.endTime !== undefined && { endTime: args.endTime }),
    ...(args.isPublic !== undefined && { isPublic: args.isPublic }),
    ...(args.feedbackEnabled !== undefined && {
      feedbackEnabled: args.feedbackEnabled,
    }),
    ...(args.feedbackDeadline !== undefined && {
      feedbackDeadline: args.feedbackDeadline,
    }),
    ...(args.postRsvpPoll !== undefined && {
      postRsvpPoll: args.postRsvpPoll,
    }),
    ...(args.rsvpPollLeadMinutes !== undefined && {
      rsvpPollLeadMinutes: args.rsvpPollLeadMinutes,
    }),
    ...(args.reminderIntervals !== undefined && {
      reminderIntervals: args.reminderIntervals,
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
    ...(args.volunteersNeeded !== undefined && {
      volunteersNeeded: args.volunteersNeeded,
    }),
    ...(args.whatsappGroupId !== undefined && {
      whatsappGroupId: args.whatsappGroupId || null,
    }),
    updatedAt: args.now,
  };
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}
type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];
abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}
type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

// Structural type for the tx parameter from defineMutator.
// Catches typos (tx.mutat) while avoiding dependency on Zero's deep internal types.
export interface Tx {
  location: string;
  mutate: {
    teamEvent: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    teamEventMember: {
      insert: ZeroMutationFn;
    };
  };
  run: ZeroRunFn;
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
      recurrenceRule: args.recurrenceRule,
    }),
  });
}

/**
 * "All events" moves saved occurrences still on the series' old group (null
 * included) to the new one, or clears them when the group is removed.
 * Occurrences given their own group keep it. Returns the moved ids.
 */
export async function moveSeriesOccurrencesToGroup(
  tx: Tx,
  args: {
    fromGroupId: string | null;
    now: number;
    seriesId: string;
    toGroupId: string | null;
  }
): Promise<string[]> {
  const occurrences = (await tx.run(
    zql.teamEvent.where("seriesId", args.seriesId)
  )) as TeamEvent[];
  const inherited = occurrences.filter(
    (occ) => (occ.whatsappGroupId ?? null) === args.fromGroupId
  );
  await Promise.all(
    inherited.map((occ) =>
      tx.mutate.teamEvent.update({
        id: occ.id,
        updatedAt: args.now,
        whatsappGroupId: args.toGroupId,
      })
    )
  );
  return inherited.map((occ) => occ.id);
}

export async function updateSeriesThis(
  tx: Tx,
  args: {
    id: string;
    now: number;
    originalDate?: string;
    newExceptionId?: string;
    costCentreId?: string;
    name?: string;
    description?: string;
    location?: string;
    publicArea?: string;
    startTime?: number;
    endTime?: number;
    isPublic?: boolean;
    feedbackEnabled?: boolean;
    feedbackDeadline?: number | null;
    postRsvpPoll?: boolean;
    programmeId?: string;
    rsvpPollLeadMinutes?: number;
    postEventNudgesEnabled?: boolean;
    reminderIntervals?: number[] | null;
    reminderTarget?: ReminderTarget;
    volunteersNeeded?: number | null;
    whatsappGroupId?: string | null;
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
          costCentreId: args.costCentreId,
          description: args.description,
          endTime: args.endTime,
          feedbackDeadline: args.feedbackDeadline,
          feedbackEnabled: args.feedbackEnabled,
          isPublic: args.isPublic,
          location: args.location,
          name: args.name,
          postEventNudgesEnabled: args.postEventNudgesEnabled,
          postRsvpPoll: args.postRsvpPoll,
          programmeId: args.programmeId,
          publicArea: args.publicArea,
          reminderIntervals: args.reminderIntervals,
          reminderTarget: args.reminderTarget,
          rsvpPollLeadMinutes: args.rsvpPollLeadMinutes,
          startTime: args.startTime,
          volunteersNeeded: args.volunteersNeeded,
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
    costCentreId?: string;
    name?: string;
    description?: string;
    location?: string;
    publicArea?: string;
    startTime?: number;
    endTime?: number;
    isPublic?: boolean;
    feedbackEnabled?: boolean;
    feedbackDeadline?: number | null;
    postRsvpPoll?: boolean;
    rsvpPollLeadMinutes?: number;
    postEventNudgesEnabled?: boolean;
    programmeId?: string;
    reminderIntervals?: number[] | null;
    reminderTarget?: ReminderTarget;
    whatsappGroupId?: string | null;
    inheritVolunteers?: boolean;
    recurrenceRule?: RecurrenceRuleValue;
    volunteersNeeded?: number | null;
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
  const newStart = args.startTime ?? existing.startTime;
  const series = {
    cancelledAt: null,
    costCentreId: args.costCentreId ?? existing.costCentreId,
    description: args.description ?? existing.description ?? null,
    endTime: args.endTime ?? existing.endTime ?? null,
    feedbackDeadline:
      args.feedbackDeadline ?? existing.feedbackDeadline ?? null,
    feedbackEnabled: args.feedbackEnabled ?? existing.feedbackEnabled,
    inheritVolunteers:
      args.inheritVolunteers ?? existing.inheritVolunteers ?? false,
    isPublic: args.isPublic ?? existing.isPublic,
    location: args.location ?? existing.location ?? null,
    name: args.name ?? existing.name,
    originalDate: args.originalDate,
    postEventNudgesEnabled:
      args.postEventNudgesEnabled ?? existing.postEventNudgesEnabled,
    postRsvpPoll: args.postRsvpPoll ?? existing.postRsvpPoll,
    publicArea: args.publicArea ?? existing.publicArea ?? null,
    recurrenceRule: newRule,
    reminderIntervals:
      args.reminderIntervals ?? existing.reminderIntervals ?? null,
    reminderTarget: args.reminderTarget ?? existing.reminderTarget ?? "group",
    rsvpPollLeadMinutes:
      args.rsvpPollLeadMinutes ?? existing.rsvpPollLeadMinutes,
    programmeId: args.programmeId ?? existing.programmeId,
    seriesId: null,
    startTime: newStart,
    updatedAt: args.now,
    volunteersNeeded:
      args.volunteersNeeded === undefined
        ? existing.volunteersNeeded
        : args.volunteersNeeded,
    whatsappGroupId:
      args.whatsappGroupId === undefined
        ? (existing.whatsappGroupId ?? null)
        : args.whatsappGroupId || null,
  };

  // Saved sessions from the split on belong to the new series, with their
  // members, attendance, interest and recaps; left behind, the new series
  // would list the same dates again.
  const moving = (
    (await tx.run(zql.teamEvent.where("seriesId", args.id))) as TeamEvent[]
  ).filter(
    (e) => e.originalDate !== null && e.originalDate >= args.originalDate
  );
  // A live session on the new series' start date is its first session, which
  // is the series row itself: that row becomes the new series, so nothing it
  // holds has to move.
  const firstDate = seriesStartDate(newStart);
  const promoted = moving.find(
    (e) => e.originalDate === firstDate && e.cancelledAt === null
  );
  const newSeriesId = promoted?.id ?? args.newSeriesId;
  if (promoted) {
    await tx.mutate.teamEvent.update({
      ...series,
      id: promoted.id,
      originalDate: promoted.originalDate,
    });
  } else {
    await tx.mutate.teamEvent.insert({
      ...series,
      createdAt: args.now,
      createdBy: userId,
      id: args.newSeriesId,
      teamId: existing.teamId,
    });
  }
  await Promise.all(
    moving
      .filter((e) => e.id !== promoted?.id)
      .map((e) =>
        tx.mutate.teamEvent.update({
          id: e.id,
          seriesId: newSeriesId,
          updatedAt: args.now,
        })
      )
  );
  return newSeriesId;
}

// ---------------------------------------------------------------------------
// cancelSeries per-mode helpers
// ---------------------------------------------------------------------------

export async function cancelSeriesAll(
  tx: Tx,
  args: { id: string; now: number }
) {
  await tx.mutate.teamEvent.update({
    cancelledAt: args.now,
    id: args.id,
    updatedAt: args.now,
  });
  const exceptions = (await tx.run(
    zql.teamEvent.where("seriesId", args.id)
  )) as TeamEvent[];
  await Promise.all(
    exceptions.map(async (exc) => {
      if (!exc.cancelledAt) {
        await tx.mutate.teamEvent.update({
          cancelledAt: args.now,
          id: exc.id,
          updatedAt: args.now,
        });
      }
    })
  );
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
      cancelledAt: args.now,
      id: args.id,
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
  await Promise.all(
    exceptions.map(async (exc) => {
      if (
        exc.originalDate &&
        exc.originalDate >= args.originalDate &&
        !exc.cancelledAt
      ) {
        await tx.mutate.teamEvent.update({
          cancelledAt: args.now,
          id: exc.id,
          updatedAt: args.now,
        });
      }
    })
  );
}
