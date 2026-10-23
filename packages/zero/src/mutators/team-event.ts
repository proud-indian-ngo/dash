import {
  COST_CENTRE_IDS,
  PROGRAMME_IDS,
  reminderTargetValues,
} from "@pi-dash/shared/constants";
import {
  REMINDER_PRESET_MINUTES,
  RSVP_POLL_LEAD_PRESET_MINUTES,
} from "@pi-dash/shared/event-reminders";
import {
  MAX_EXCLUDE_RULE_LENGTH,
  MAX_EXCLUDE_RULES,
  MAX_EXDATES,
  MAX_RECURRENCE_RULE_LENGTH,
  parseRecurrenceRule,
  seriesStartDate,
  validateRecurrenceRule,
} from "@pi-dash/shared/rrule-expand";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import "../context";
import type { Context } from "../context";
import { parseRRule } from "../lib/rrule-utils";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { TeamEvent, TeamEventMember } from "../schema";
import { type Schema, zql } from "../schema";
import { pickCostCentreId } from "./cost-centre-pick";
import { assertEventProjectMovesAllowed, eventProjects } from "./grant";
import { assertEventNotManagedByKalakriti } from "./kalakriti-event-guard";
import {
  clearLeadApprovalsOnMovedEvents,
  eventProgrammes,
} from "./lead-approval";
import { assertSafeToJoinEvent } from "./safeguarding";
import {
  buildUpdateFields,
  cancelSeriesAll,
  cancelSeriesFollowing,
  cancelSeriesThis,
  ISO_DATE_RE,
  type SeriesCancelResult,
  changedSeriesArgs,
  moveSeriesOccurrencesToGroup,
  moveSeriesSessionsToProgramme,
  sessionFieldsFrom,
  type Tx,
  updateSeriesAll,
  updateSeriesFollowing,
  updateSeriesThis,
} from "./team-event-series";
import {
  assertEventIdAvailable,
  eventPartnersSchema,
  replaceEventPartners,
  teamEventSocialMutators,
  volunteersNeededSchema,
} from "./team-event-social";
import {
  assertWhatsAppGroupAvailable,
  pushAddGroupMembersTask,
  whatsappGroupChange,
} from "./whatsapp-group-link";

const reminderIntervalsSchema = z
  .array(z.number().refine((n) => REMINDER_PRESET_MINUTES.includes(n)))
  .nullable()
  .optional();

const reminderTargetSchema = z.enum(reminderTargetValues).optional();

const rsvpPollLeadMinutesSchema = z
  .number()
  .refine((n) => RSVP_POLL_LEAD_PRESET_MINUTES.includes(n))
  .optional();

interface MutatorCtx {
  asyncTasks?: {
    push: BivariantTaskPush["bivarianceHack"];
  };
  traceId?: string;
  userId: string;
}

abstract class BivariantTaskPush {
  abstract bivarianceHack(task: unknown): void;
}

export function computeOccurrenceStart(
  seriesStartTime: number,
  occDate: string
): number {
  const seriesStart = new Date(seriesStartTime);
  const occStart = new Date(occDate);
  occStart.setHours(
    seriesStart.getHours(),
    seriesStart.getMinutes(),
    seriesStart.getSeconds(),
    seriesStart.getMilliseconds()
  );
  return occStart.getTime();
}

interface JoinTarget {
  endTime: number | null;
  eventId: string;
  location: string | null;
  name: string;
  startTime: number;
}

/**
 * Whether any session of a series has started, or money is charged to it:
 * from then on a programme change applies forward only.
 */
async function seriesHasStarted(
  tx: Tx,
  series: Pick<TeamEvent, "id" | "startTime">,
  now: number
): Promise<boolean> {
  if (series.startTime <= now) {
    return true;
  }
  const sessions = (await tx.run(
    zql.teamEvent.where("seriesId", series.id)
  )) as TeamEvent[];
  if (sessions.some((s) => s.startTime <= now)) {
    return true;
  }
  const ids = [series.id, ...sessions.map((s) => s.id)];
  const [claim, payment] = await Promise.all([
    // Rejected and voided requests charge nothing.
    tx.run(
      zql.reimbursement
        .where("eventId", "IN", ids)
        .where("status", "!=", "rejected")
        .where("voidedAt", "IS", null)
        .one()
    ),
    tx.run(
      zql.vendorPayment
        .where("eventId", "IN", ids)
        .where("status", "!=", "rejected")
        .where("voidedAt", "IS", null)
        .one()
    ),
  ]);
  return Boolean(claim ?? payment);
}

/**
 * The scope a series edit or cancel really has. "This and following" on the
 * series' own start date is every session, so it is "all": splitting there
 * would leave an empty series before the first session.
 */
function seriesScope(
  args: { mode: "this" | "following" | "all"; originalDate?: string },
  existing: Pick<TeamEvent, "recurrenceRule" | "seriesId" | "startTime">
): "this" | "following" | "all" {
  return args.mode === "following" &&
    existing.recurrenceRule &&
    !existing.seriesId &&
    args.originalDate === seriesStartDate(existing.startTime)
    ? "all"
    : args.mode;
}

/**
 * The start of the session a "this" or "following" cancel targets: a saved
 * row for the date by its own start, otherwise the series' time of day on
 * that date. A saved row or standalone event targets itself.
 */
async function targetSessionStart(
  tx: Tx,
  existing: TeamEvent,
  date: string | undefined
): Promise<number> {
  if (!date || existing.seriesId || !existing.recurrenceRule) {
    return existing.startTime;
  }
  const saved = (await tx.run(
    zql.teamEvent
      .where("seriesId", existing.id)
      .where("originalDate", date)
      .one()
  )) as TeamEvent | undefined;
  if (saved) {
    return saved.startTime;
  }
  const firstDay = Date.parse(
    `${seriesStartDate(existing.startTime)}T00:00:00Z`
  );
  return Date.parse(`${date}T00:00:00Z`) + (existing.startTime - firstDay);
}

/** Resolve (materializing if needed) the event row a volunteer joins. */
export async function resolveJoinTarget(
  tx: Tx,
  ctx: MutatorCtx,
  event: TeamEvent,
  args: {
    eventId: string;
    occDate?: string;
    materializedId?: string;
    now: number;
  }
): Promise<JoinTarget> {
  const now = tx.location === "server" ? Date.now() : args.now;
  // Without a date, a series parent means its first session.
  const occDate =
    args.occDate ??
    (event.recurrenceRule && !event.seriesId
      ? seriesStartDate(event.startTime)
      : undefined);
  if (!occDate) {
    if (event.startTime <= now) {
      throw new Error("Cannot join event that has already started");
    }
    return {
      endTime: event.endTime,
      eventId: args.eventId,
      location: event.location,
      name: event.name,
      startTime: event.startTime,
    };
  }
  if (!event.recurrenceRule) {
    throw new Error("Event is not a recurring series");
  }
  // A saved row for the date takes it, the start date included: there it
  // stands for the first session.
  const existing = (await tx.run(
    zql.teamEvent
      .where("seriesId", args.eventId)
      .where("originalDate", occDate)
      .one()
  )) as TeamEvent | undefined;
  if (existing) {
    if (existing.cancelledAt) {
      throw new Error("This session was cancelled");
    }
    if (existing.startTime <= now) {
      throw new Error("Cannot join event that has already started");
    }
    return {
      endTime: existing.endTime,
      eventId: existing.id,
      location: existing.location,
      name: existing.name,
      startTime: existing.startTime,
    };
  }
  // The series' first session is the parent row itself.
  if (occDate === seriesStartDate(event.startTime)) {
    if (event.startTime <= now) {
      throw new Error("Cannot join event that has already started");
    }
    return {
      endTime: event.endTime,
      eventId: args.eventId,
      location: event.location,
      name: event.name,
      startTime: event.startTime,
    };
  }
  if (!args.materializedId) {
    throw new Error("materializedId required for virtual occurrence");
  }
  const occStart = computeOccurrenceStart(event.startTime, occDate);
  if (occStart <= now) {
    throw new Error("Cannot join event that has already started");
  }
  const duration =
    event.endTime === null ? null : event.endTime - event.startTime;
  const occEnd = duration === null ? null : occStart + duration;
  await tx.mutate.teamEvent.insert({
    cancelledAt: null,
    costCentreId: event.costCentreId,
    createdAt: args.now,
    createdBy: ctx.userId,
    description: event.description,
    endTime: occEnd,
    feedbackDeadline: event.feedbackDeadline,
    feedbackEnabled: event.feedbackEnabled,
    id: args.materializedId,
    inheritVolunteers: event.inheritVolunteers,
    isPublic: event.isPublic,
    location: event.location,
    name: event.name,
    originalDate: occDate,
    postEventNudgesEnabled: event.postEventNudgesEnabled,
    postRsvpPoll: event.postRsvpPoll,
    programmeId: event.programmeId,
    projectId: event.projectId ?? null,
    publicArea: event.publicArea,
    recurrenceRule: null,
    reminderIntervals: event.reminderIntervals,
    reminderTarget: event.reminderTarget,
    rsvpPollLeadMinutes: event.rsvpPollLeadMinutes,
    seriesId: args.eventId,
    startTime: occStart,
    teamId: event.teamId,
    updatedAt: args.now,
    whatsappGroupId: event.whatsappGroupId,
  });

  if (event.inheritVolunteers) {
    const members = (await tx.run(
      zql.teamEventMember.where("eventId", args.eventId)
    )) as TeamEventMember[];
    await Promise.all(
      members.map(async (member) => {
        await tx.mutate.teamEventMember.insert({
          addedAt: member.addedAt,
          eventId: args.materializedId,
          id: uuidv7(),
          userId: member.userId,
        });
      })
    );
  }

  return {
    endTime: occEnd,
    eventId: args.materializedId,
    location: event.location,
    name: event.name,
    startTime: occStart,
  };
}

async function pushCreateServerTasks(
  tx: Tx,
  ctx: MutatorCtx,
  args: {
    id: string;
    name: string;
    startTime: number;
    location?: string;
    teamId: string;
    createWhatsAppGroup?: boolean;
    whatsappGroupId?: string;
  },
  isBackdated: boolean
) {
  if (args.createWhatsAppGroup && !args.whatsappGroupId) {
    const eventId = args.id;
    const eventName = args.name;
    const creatorUserId = ctx.userId;
    ctx.asyncTasks?.push({
      fn: async () => {
        const { enqueue } = await import("@pi-dash/jobs/enqueue");
        await enqueue(
          "whatsapp-create-group",
          {
            creatorUserId,
            entityId: eventId,
            entityType: "event",
            groupName: eventName,
          },
          { traceId: ctx.traceId }
        );
      },
      meta: { eventId, eventName, mutator: "createTeamEvent" },
    });
  }

  if (!isBackdated) {
    const eventId = args.id;
    const eventName = args.name;
    const { startTime } = args;
    const location = args.location ?? null;
    const { teamId } = args;
    const members = (await tx.run(zql.teamMember.where("teamId", teamId))) as {
      userId: string;
    }[];
    const teamMemberIds = members.map((m) => m.userId);
    ctx.asyncTasks?.push({
      fn: async () => {
        const { enqueue } = await import("@pi-dash/jobs/enqueue");
        await enqueue(
          "notify-event-created",
          {
            eventId,
            eventName,
            location,
            startTime,
            teamId,
            teamMemberIds,
          },
          { traceId: ctx.traceId }
        );
      },
      meta: {
        eventId,
        eventName,
        location,
        mutator: "createTeamEvent",
        startTime,
        teamId,
      },
    });
  }
}

const recurrenceRuleSchema = z
  .object({
    excludeRules: z
      .array(z.string().min(1).max(MAX_EXCLUDE_RULE_LENGTH))
      .max(MAX_EXCLUDE_RULES)
      .optional(),
    exdates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .max(MAX_EXDATES)
      .optional(),
    rrule: z.string().min(1).max(MAX_RECURRENCE_RULE_LENGTH),
  })
  .superRefine((rule, ctx) => {
    try {
      validateRecurrenceRule(rule);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid recurrence rule",
      });
    }
  })
  .optional();

/**
 * The event's programme: the one asked for if it is active, else the team's
 * programme, else the Unallocated holding programme.
 */
export async function resolveProgrammeId(
  tx: Transaction<Schema>,
  requested: string | undefined,
  teamId: string
): Promise<string> {
  if (requested) {
    const programme = await tx.run(zql.programme.where("id", requested).one());
    if (!programme && tx.location === "server") {
      throw new Error("Programme not found");
    }
    if (programme?.active === false) {
      throw new Error("Choose an active programme");
    }
    return requested;
  }
  const team = await tx.run(zql.team.where("id", teamId).one());
  return team?.programmeId ?? PROGRAMME_IDS.unallocated;
}

/**
 * A programme change must point at an active programme. On the client the
 * cache may not hold the row yet, so only the server enforces existence.
 */
async function assertProgrammeChange(
  tx: Transaction<Schema>,
  current: string | null,
  requested: string | undefined
): Promise<void> {
  if (requested === undefined || requested === current) {
    return;
  }
  const programme = await tx.run(zql.programme.where("id", requested).one());
  if (!programme) {
    if (tx.location === "server") {
      throw new Error("Programme not found");
    }
    return;
  }
  if (programme.active === false) {
    throw new Error("Choose an active programme");
  }
}

/**
 * The project an event write stores: undefined leaves the stored one, null
 * clears it. Only `finance.manage` sets or clears it; anyone else's save
 * keeps it. A programme move clears it unless finance names a project under
 * the new programme. A new pick must sit under the event's programme and
 * not be closed. On the client the cache may not hold the row, so only the
 * server enforces existence.
 */
export async function eventProjectChange(
  tx: Transaction<Schema>,
  args: {
    canManageFinance: boolean;
    current: string | null;
    programmeId: string | null;
    programmeMoves: boolean;
    requested: string | null | undefined;
  }
): Promise<string | null | undefined> {
  const requested = args.canManageFinance ? args.requested : undefined;
  if (requested === undefined) {
    return args.programmeMoves ? null : undefined;
  }
  if (
    requested === null ||
    (requested === args.current && !args.programmeMoves)
  ) {
    return requested;
  }
  const project = await tx.run(zql.project.where("id", requested).one());
  if (!project) {
    if (tx.location === "server") {
      throw new Error("Project not found");
    }
    return requested;
  }
  if (project.programmeId !== args.programmeId) {
    throw new Error("Choose a project under the event's programme");
  }
  if (project.status === "closed" && requested !== args.current) {
    throw new Error("Choose a project that isn't closed");
  }
  return requested;
}

/**
 * A programme move by someone outside finance cleared the event's project,
 * so its expenses leave that project's grants and budgets: tell finance by
 * inbox and email. The audit row records the edit itself.
 */
async function noticeProjectCleared(
  ctx: Context,
  tx: Transaction<Schema>,
  args: {
    current: string | null;
    event: { id: string; name: string };
    next: string | null | undefined;
    now: number;
  }
) {
  if (
    tx.location !== "server" ||
    can(ctx, "finance.manage") ||
    !args.current ||
    args.next !== null
  ) {
    return;
  }
  const project = await tx.run(zql.project.where("id", args.current).one());
  ctx.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await enqueue(
        "notify-event-project-cleared",
        {
          eventId: args.event.id,
          eventName: args.event.name,
          projectName: project?.name ?? "its project",
          updatedAt: args.now,
        },
        { traceId: ctx.traceId }
      );
    },
    meta: { eventId: args.event.id, mutator: "teamEvent.projectCleared" },
  });
}

/**
 * The group an event edit moves to (undefined when unchanged, null when
 * removed), refusing a group another team or event already uses.
 */
async function assertEventGroupChange(
  tx: Tx,
  existing: Pick<TeamEvent, "id" | "seriesId" | "whatsappGroupId">,
  requested: string | null | undefined
): Promise<string | null | undefined> {
  const next = whatsappGroupChange(existing.whatsappGroupId, requested);
  if (next) {
    await assertWhatsAppGroupAvailable(tx, next, {
      seriesRootId: existing.seriesId ?? existing.id,
      type: "event",
    });
  }
  return next;
}

/**
 * Add or invite the members of an event, and of any occurrence rows that
 * moved with it, to the group it was given, in one task.
 */
async function pushEventGroupMembersTask(
  tx: Tx,
  ctx: MutatorCtx,
  args: {
    eventId: string;
    groupId: string;
    mutator: string;
    occurrenceIds: string[];
  }
): Promise<void> {
  const members = (await tx.run(
    zql.teamEventMember.where("eventId", "IN", [
      args.eventId,
      ...args.occurrenceIds,
    ])
  )) as TeamEventMember[];
  pushAddGroupMembersTask(ctx, {
    entityId: args.eventId,
    entityType: "event",
    groupId: args.groupId,
    mutator: args.mutator,
    userIds: members.map((m) => m.userId),
  });
}

export const teamEventMutators = {
  addMember: defineMutator(
    z.object({
      eventId: z.string(),
      id: z.string(),
      now: z.number(),
      userId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.eventId);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_members", isTeamLead);

      const existing = await tx.run(
        zql.teamEventMember
          .where("eventId", args.eventId)
          .where("userId", args.userId)
          .one()
      );
      if (existing) {
        throw new Error("User is already a member");
      }
      await assertSafeToJoinEvent(tx, args.eventId, [args.userId], {
        self: args.userId === ctx.userId,
      });

      await tx.mutate.teamEventMember.insert({
        addedAt: args.now,
        eventId: args.eventId,
        id: args.id,
        userId: args.userId,
      });

      if (tx.location === "server") {
        const { userId } = args;
        const { whatsappGroupId } = event;
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "whatsapp-add-member",
                {
                  groupId: whatsappGroupId,
                  userId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventId: args.eventId,
              mutator: "addEventMember",
              userId,
              whatsappGroupId,
            },
          });
        }

        const { eventId } = args;
        const eventName = event.name;
        const { startTime } = event;
        const { location } = event;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-added-to-event",
              {
                eventId,
                eventName,
                location,
                memberId: args.id,
                startTime,
                userId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "addEventMember",
            userId,
          },
        });
      }
    }
  ),

  addMembers: defineMutator(
    z.object({
      eventId: z.string(),
      members: z.array(z.object({ id: z.string(), userId: z.string() })).min(1),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.eventId);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_members", isTeamLead);
      await assertSafeToJoinEvent(
        tx,
        args.eventId,
        args.members.map((m) => m.userId),
        { self: false }
      );

      await Promise.all(
        args.members.map(async (member) => {
          const existing = await tx.run(
            zql.teamEventMember
              .where("eventId", args.eventId)
              .where("userId", member.userId)
              .one()
          );
          if (!existing) {
            await tx.mutate.teamEventMember.insert({
              addedAt: args.now,
              eventId: args.eventId,
              id: member.id,
              userId: member.userId,
            });
          }
        })
      );

      if (tx.location === "server") {
        const { whatsappGroupId } = event;
        const userIds = args.members.map((m) => m.userId);
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "whatsapp-add-members",
                {
                  groupId: whatsappGroupId,
                  userIds,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              mutator: "addEventMembers",
              userCount: userIds.length,
              whatsappGroupId,
            },
          });
        }

        const { eventId } = args;
        const eventName = event.name;
        const { startTime } = event;
        const { location } = event;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-users-added-to-event",
              {
                addedAt: args.now,
                eventId,
                eventName,
                location,
                startTime,
                userIds,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "addEventMembers",
            userCount: userIds.length,
          },
        });
      }
    }
  ),

  cancel: defineMutator(
    z.object({
      id: z.string(),
      now: z.number(),
      reason: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.id);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.cancel", isTeamLead);
      // A second cancel would send the cancellation notice again.
      if (existing.cancelledAt) {
        throw new Error("Event is already cancelled");
      }
      // Cancelling the series row would hide every session, held ones too.
      if (existing.recurrenceRule && !existing.seriesId) {
        throw new Error("Choose which sessions of the series to cancel");
      }

      const now = tx.location === "server" ? Date.now() : args.now;
      if (
        existing.startTime <= now &&
        isTeamLead &&
        !can(ctx, "events.cancel")
      ) {
        throw new Error("Cannot cancel an event that has already started");
      }

      await tx.mutate.teamEvent.update({
        cancelledAt: now,
        id: args.id,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const eventId = args.id;
        const eventName = existing.name;
        const { teamId } = existing;
        const cancelledAt = now;
        const { reason } = args;
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", eventId)
        )) as TeamEventMember[];
        const eventMemberIds = eventMembers.map((m) => m.userId);

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-cancelled",
              {
                cancelledAt,
                cancelledEventIds: [eventId],
                eventId,
                eventMemberIds,
                eventName,
                reason,
                teamId,
              },
              { traceId: ctx.traceId }
            );
            await enqueue(
              "close-rsvp-poll-on-cancel",
              {
                cancelledAt,
                cancelledEventIds: [eventId],
                eventId,
                eventName,
                reason,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { eventId, eventName, mutator: "cancelTeamEvent", teamId },
        });
      }
    }
  ),

  /** Cancel with mode: "this", "following", or "all". */
  cancelSeries: defineMutator(
    z.object({
      id: z.string(),
      mode: z.enum(["this", "following", "all"]),
      newExceptionId: z.string().optional(),
      now: z.number(),
      originalDate: z.string().regex(ISO_DATE_RE).optional(),
      reason: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.id);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.cancel", isTeamLead);
      const mode = seriesScope(args, existing);

      // Team leads without events.cancel cannot cancel a session that has
      // started, judged by the session the cancel starts from. "All" never
      // cancels a started session, so it stays open.
      const sessionStart =
        mode === "all"
          ? undefined
          : await targetSessionStart(tx, existing, args.originalDate);
      const now = tx.location === "server" ? Date.now() : args.now;
      if (
        isTeamLead &&
        !can(ctx, "events.cancel") &&
        sessionStart !== undefined &&
        sessionStart <= now
      ) {
        throw new Error("Cannot cancel an event that has already started");
      }

      let result: SeriesCancelResult = {
        cancelledIds: [],
        droppedUnsaved: false,
      };
      // Whether earlier sessions stay live, so only later ones are cancelled.
      let seriesEnded = false;
      // Every time decision and timestamp below uses the server's clock.
      const timed = { ...args, now };
      if (mode === "all") {
        result = await cancelSeriesAll(tx, timed, existing);
        seriesEnded = !result.cancelledIds.includes(args.id);
      } else if (mode === "this") {
        result = await cancelSeriesThis(tx, timed, existing, ctx.userId);
      } else if (mode === "following" && args.originalDate) {
        result = await cancelSeriesFollowing(
          tx,
          { ...timed, originalDate: args.originalDate },
          existing
        );
        seriesEnded = true;
      }
      const { cancelledIds } = result;
      // Unsaved sessions dropped had the series' volunteers only when they
      // inherit them.
      const notifiedIds =
        result.droppedUnsaved && existing.inheritVolunteers
          ? [args.id, ...cancelledIds]
          : cancelledIds;

      // One notice to the members of every cancelled session; started
      // sessions kept by "all" send nothing, and neither does a started
      // session cancelled with "this" (one that didn't happen).
      const startedSession = sessionStart !== undefined && sessionStart <= now;
      if (
        tx.location === "server" &&
        notifiedIds.length > 0 &&
        !startedSession
      ) {
        const eventId = args.id;
        const eventName = existing.name;
        const { teamId } = existing;
        const cancelledAt = now;
        const { reason } = args;
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", "IN", notifiedIds)
        )) as TeamEventMember[];
        const eventMemberIds = [...new Set(eventMembers.map((m) => m.userId))];
        const polls = (
          cancelledIds.length > 0
            ? await tx.run(zql.teamEvent.where("id", "IN", cancelledIds))
            : []
        ) as TeamEvent[];
        // Every row this cancel marked, including a cancelled row saved for an
        // unsaved date, so the jobs can tell when a restore undid it.
        const cancelledRows = (await tx.run(
          zql.teamEvent
            .where("seriesId", existing.seriesId ?? args.id)
            .where("cancelledAt", cancelledAt)
        )) as TeamEvent[];
        const cancelledEventIds = [
          ...new Set([...cancelledIds, ...cancelledRows.map((e) => e.id)]),
        ];

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-cancelled",
              {
                cancelledAt,
                cancelledEventIds,
                eventId,
                eventMemberIds,
                eventName,
                reason,
                seriesEnded,
                sessionStart,
                teamId,
              },
              { traceId: ctx.traceId }
            );
            await Promise.all(
              polls.map((poll) =>
                enqueue(
                  "close-rsvp-poll-on-cancel",
                  {
                    cancelledAt,
                    cancelledEventIds,
                    eventId: poll.id,
                    eventName: poll.name,
                    reason,
                  },
                  { traceId: ctx.traceId }
                )
              )
            );
          },
          meta: { eventId, eventName, mutator: "cancelSeriesEvent", teamId },
        });
      }
    }
  ),

  /**
   * Undo a cancel. It sends no notice: reminders and the RSVP poll follow
   * `cancelledAt`, so they resume on their own, and the cancel's jobs skip
   * once it no longer stands. A poll closed by the cancel stays closed until
   * Post poll replaces it. A series row restores with the sessions cancelled
   * alongside it; sessions cut by "this and following" or "all upcoming"
   * after the series started stay cancelled, since the rule's old end is gone.
   */
  restore: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.id);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.cancel", isTeamLead);
      if (!existing.cancelledAt) {
        throw new Error("This event isn't cancelled");
      }

      const restore = (id: string) =>
        tx.mutate.teamEvent.update({
          cancelledAt: null,
          id,
          updatedAt: args.now,
        });

      if (existing.recurrenceRule && !existing.seriesId) {
        const exceptions = (await tx.run(
          zql.teamEvent
            .where("seriesId", args.id)
            .where("cancelledAt", existing.cancelledAt)
        )) as TeamEvent[];
        // Sessions that passed while it was cancelled didn't happen.
        if (
          existing.startTime <= args.now ||
          exceptions.some((e) => e.startTime <= args.now)
        ) {
          throw new Error(
            "This series has started since it was cancelled, so it can't be restored"
          );
        }
        await restore(args.id);
        await Promise.all(exceptions.map((e) => restore(e.id)));
        return;
      }

      if (existing.seriesId) {
        const series = (await tx.run(
          zql.teamEvent.where("id", existing.seriesId).one()
        )) as TeamEvent | undefined;
        if (series?.cancelledAt) {
          throw new Error("The series is cancelled. Restore the series first");
        }
        // "This and following" and "all upcoming" end the rule before the
        // session; restoring it would leave a session past the series' end.
        const rule = parseRecurrenceRule(series?.recurrenceRule);
        const until = rule ? parseRRule(rule.rrule).options.until : null;
        if (
          until &&
          existing.originalDate &&
          Date.parse(`${existing.originalDate}T00:00:00Z`) > until.getTime()
        ) {
          throw new Error(
            "The series ends before this session, so it can't be restored"
          );
        }
      }
      // As with cancel, only the permission touches a session that has started.
      if (
        existing.startTime <= args.now &&
        isTeamLead &&
        !can(ctx, "events.cancel")
      ) {
        throw new Error("Cannot restore an event that has already started");
      }
      await restore(args.id);
    }
  ),

  create: defineMutator(
    z.object({
      costCentreId: z.string().optional(),
      createWhatsAppGroup: z.boolean().optional(),
      description: z.string().optional(),
      endTime: z.number().optional(),
      feedbackDeadline: z.number().nullable().optional(),
      feedbackEnabled: z.boolean().optional(),
      id: z.string(),
      inheritVolunteers: z.boolean().optional(),
      programmeId: z.string().optional(),
      // Finance only. Undefined keeps the stored project; null clears it.
      projectId: z.string().nullable().optional(),
      isPublic: z.boolean().optional(),
      location: z.string().optional(),
      name: z.string().min(1),
      now: z.number(),
      postEventNudgesEnabled: z.boolean().optional(),
      partners: eventPartnersSchema.optional(),
      postRsvpPoll: z.boolean().optional(),
      publicArea: z.string().max(80).optional(),
      recurrenceRule: recurrenceRuleSchema,
      reminderIntervals: reminderIntervalsSchema,
      reminderTarget: reminderTargetSchema,
      rsvpPollLeadMinutes: rsvpPollLeadMinutesSchema,
      startTime: z.number(),
      teamId: z.string(),
      volunteersNeeded: volunteersNeededSchema,
      whatsappGroupId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      if (args.endTime !== undefined && args.endTime <= args.startTime) {
        throw new Error("End time must be after start time");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", args.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.create", isTeamLead);

      const isBackdated =
        tx.location === "server"
          ? args.startTime < Date.now()
          : args.startTime < args.now;
      if (isBackdated && !can(ctx, "events.create_backdated") && !isTeamLead) {
        throw new Error("Start time must be in the future");
      }

      await assertEventIdAvailable(tx, args.id);
      if (args.whatsappGroupId) {
        await assertWhatsAppGroupAvailable(tx, args.whatsappGroupId, {
          seriesRootId: args.id,
          type: "event",
        });
      }
      const programmeId = await resolveProgrammeId(
        tx,
        args.programmeId,
        args.teamId
      );
      const projectId = await eventProjectChange(tx, {
        canManageFinance: can(ctx, "finance.manage"),
        current: null,
        programmeId,
        programmeMoves: false,
        requested: args.projectId,
      });
      await tx.mutate.teamEvent.insert({
        cancelledAt: null,
        // The client may not hold the centres yet; the server always resolves.
        costCentreId:
          (await pickCostCentreId(tx, args.costCentreId)) ??
          COST_CENTRE_IDS.bangalore,
        createdAt: args.now,
        createdBy: ctx.userId,
        description: args.description,
        endTime: args.endTime,
        feedbackDeadline: args.feedbackDeadline,
        feedbackEnabled: args.feedbackEnabled,
        id: args.id,
        inheritVolunteers: args.inheritVolunteers,
        isPublic: args.isPublic,
        location: args.location,
        name: args.name,
        originalDate: null,
        postEventNudgesEnabled: args.postEventNudgesEnabled,
        postRsvpPoll: args.postRsvpPoll,
        programmeId,
        projectId: projectId ?? null,
        publicArea: args.publicArea,
        recurrenceRule: args.recurrenceRule,
        reminderIntervals: args.reminderIntervals,
        reminderTarget: args.reminderTarget,
        rsvpPollLeadMinutes: args.rsvpPollLeadMinutes,
        seriesId: null,
        startTime: args.startTime,
        teamId: args.teamId,
        updatedAt: args.now,
        volunteersNeeded: args.volunteersNeeded ?? null,
        whatsappGroupId: args.whatsappGroupId,
      });
      if (args.partners?.length) {
        await replaceEventPartners(
          tx,
          args.id,
          args.teamId,
          args.partners,
          args.now
        );
      }

      if (tx.location === "server") {
        await pushCreateServerTasks(tx, ctx, args, isBackdated);
      }
    }
  ),

  joinAsMember: defineMutator(
    z.object({
      eventId: z.string(),
      id: z.string(),
      materializedId: z.string().optional(),
      now: z.number(),
      occDate: z.string().regex(ISO_DATE_RE).optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }

      await assertEventNotManagedByKalakriti(tx, args.eventId);

      const teamMembership = await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .one()
      );
      if (!teamMembership) {
        throw new Error("Not a member of the event's team");
      }

      const target = await resolveJoinTarget(tx, ctx, event, args);

      const existingMember = await tx.run(
        zql.teamEventMember
          .where("eventId", target.eventId)
          .where("userId", ctx.userId)
          .one()
      );
      if (existingMember) {
        throw new Error("Already a member of this event");
      }
      await assertSafeToJoinEvent(tx, args.eventId, [ctx.userId], {
        self: true,
      });

      await tx.mutate.teamEventMember.insert({
        addedAt: args.now,
        eventId: target.eventId,
        id: args.id,
        userId: ctx.userId,
      });

      if (tx.location === "server") {
        const { userId } = ctx;
        const { whatsappGroupId } = event;
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "whatsapp-add-member",
                {
                  groupId: whatsappGroupId,
                  userId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventId: target.eventId,
              mutator: "joinEventAsMember",
              userId,
              whatsappGroupId,
            },
          });
        }

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-added-to-event",
              {
                eventId: target.eventId,
                eventName: target.name,
                location: target.location,
                memberId: args.id,
                startTime: target.startTime,
                userId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId: target.eventId,
            eventName: target.name,
            mutator: "joinEventAsMember",
            userId,
          },
        });
      }
    }
  ),

  leaveEvent: defineMutator(
    z.object({
      eventId: z.string(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.eventId);
      // Attendance tracked post-start; retroactive leaves mangle records.
      const now = tx.location === "server" ? Date.now() : args.now;
      if (event.startTime <= now) {
        throw new Error("Cannot leave event that has already started");
      }

      const member = (await tx.run(
        zql.teamEventMember
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as TeamEventMember | undefined;
      if (!member) {
        throw new Error("Not a member of this event");
      }

      await tx.mutate.teamEventMember.delete({ id: member.id });

      if (tx.location === "server") {
        const volunteerUserId = ctx.userId;
        const { eventId } = args;
        const eventName = event.name;
        const { teamId } = event;
        const { whatsappGroupId } = event;
        const leftAt = args.now;

        const leads = await tx.run(
          zql.teamMember.where("teamId", teamId).where("role", "lead")
        );
        const leadUserIds = leads.map((l) => l.userId);
        const volunteer = await tx.run(
          zql.user.where("id", volunteerUserId).one()
        );
        const volunteerName = volunteer?.name;

        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "whatsapp-remove-member",
                {
                  groupId: whatsappGroupId,
                  userId: volunteerUserId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventId,
              mutator: "leaveEvent",
              userId: volunteerUserId,
              whatsappGroupId,
            },
          });
        }

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-volunteer-left",
              {
                eventId,
                eventName,
                leadUserIds,
                leftAt,
                teamId,
                volunteerName: volunteerName ?? "Someone",
                volunteerUserId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "leaveEvent",
            teamId,
            volunteerUserId,
          },
        });
      }
    }
  ),

  markAllPresent: defineMutator(
    z.object({
      eventId: z.string(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.eventId);
      if (event.startTime > args.now) {
        throw new Error("Cannot mark attendance before event starts");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(
        ctx,
        "events.manage_attendance",
        isTeamLead
      );

      const members = (await tx.run(
        zql.teamEventMember.where("eventId", args.eventId)
      )) as TeamEventMember[];

      await Promise.all(
        members.map(async (member) => {
          await tx.mutate.teamEventMember.update({
            attendance: "present",
            attendanceMarkedAt: args.now,
            attendanceMarkedBy: ctx.userId,
            id: member.id,
          });
        })
      );
    }
  ),

  markAttendance: defineMutator(
    z.object({
      attendance: z.enum(["present", "absent"]).nullable(),
      eventId: z.string(),
      memberId: z.string(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.eventId);
      if (event.startTime > args.now) {
        throw new Error("Cannot mark attendance before event starts");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(
        ctx,
        "events.manage_attendance",
        isTeamLead
      );

      const member = (await tx.run(
        zql.teamEventMember.where("id", args.memberId).one()
      )) as TeamEventMember | undefined;
      if (!member || member.eventId !== args.eventId) {
        throw new Error("Member not found in this event");
      }

      await tx.mutate.teamEventMember.update({
        attendance: args.attendance,
        attendanceMarkedAt: args.now,
        attendanceMarkedBy: ctx.userId,
        id: args.memberId,
      });
    }
  ),

  /** Materialize a virtual occurrence into an exception row. */
  materialize: defineMutator(
    z.object({
      id: z.string(),
      now: z.number(),
      originalDate: z.string().regex(ISO_DATE_RE),
      seriesId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const series = (await tx.run(
        zql.teamEvent.where("id", args.seriesId).one()
      )) as TeamEvent | undefined;
      if (!series) {
        throw new Error("Series not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.seriesId);
      if (!series.recurrenceRule) {
        throw new Error("Event is not a recurring series");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", series.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.edit", isTeamLead);

      // Check if already materialized
      const existing = (await tx.run(
        zql.teamEvent
          .where("seriesId", args.seriesId)
          .where("originalDate", args.originalDate)
          .one()
      )) as TeamEvent | undefined;
      if (existing) {
        throw new Error("Occurrence already materialized");
      }
      if (args.originalDate === seriesStartDate(series.startTime)) {
        throw new Error("The first session is the series itself");
      }

      const occStart = computeOccurrenceStart(
        series.startTime,
        args.originalDate
      );
      const duration =
        series.endTime === null ? null : series.endTime - series.startTime;
      const occEnd = duration === null ? null : occStart + duration;

      await assertEventIdAvailable(tx, args.id);
      await tx.mutate.teamEvent.insert({
        cancelledAt: null,
        costCentreId: series.costCentreId,
        createdAt: args.now,
        createdBy: ctx.userId,
        description: series.description,
        endTime: occEnd,
        feedbackDeadline: series.feedbackDeadline,
        feedbackEnabled: series.feedbackEnabled,
        id: args.id,
        inheritVolunteers: series.inheritVolunteers,
        isPublic: series.isPublic,
        location: series.location,
        managementDomain: series.managementDomain,
        name: series.name,
        originalDate: args.originalDate,
        postRsvpPoll: series.postRsvpPoll,
        programmeId: series.programmeId,
        projectId: series.projectId ?? null,
        publicArea: series.publicArea,
        recurrenceRule: null,
        reminderIntervals: series.reminderIntervals,
        reminderTarget: series.reminderTarget,
        rsvpPollLeadMinutes: series.rsvpPollLeadMinutes,
        seriesId: args.seriesId,
        startTime: occStart,
        teamId: series.teamId,
        updatedAt: args.now,
        whatsappGroupId: series.whatsappGroupId,
      });

      if (series.inheritVolunteers) {
        const members = (await tx.run(
          zql.teamEventMember.where("eventId", series.id)
        )) as TeamEventMember[];
        await Promise.all(
          members.map(async (member) => {
            await tx.mutate.teamEventMember.insert({
              addedAt: member.addedAt,
              eventId: args.id,
              id: uuidv7(),
              userId: member.userId,
            });
          })
        );
      }
    }
  ),

  removeMember: defineMutator(
    z.object({
      eventId: z.string(),
      memberId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = (await tx.run(
        zql.teamEvent.where("id", args.eventId).one()
      )) as TeamEvent | undefined;
      if (!event) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.eventId);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_members", isTeamLead);

      const member = (await tx.run(
        zql.teamEventMember.where("id", args.memberId).one()
      )) as TeamEventMember | undefined;
      if (!member) {
        throw new Error("Member not found");
      }

      const memberUserId = member.userId;
      await tx.mutate.teamEventMember.delete({ id: args.memberId });

      if (tx.location === "server") {
        const { whatsappGroupId } = event;
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "whatsapp-remove-member",
                {
                  groupId: whatsappGroupId,
                  userId: memberUserId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              memberUserId,
              mutator: "removeEventMember",
              whatsappGroupId,
            },
          });
        }

        const { eventId } = args;
        const eventName = event.name;
        const { teamId } = event;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-removed-from-event",
              {
                eventId,
                eventName,
                memberId: args.memberId,
                teamId,
                userId: memberUserId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "removeEventMember",
            teamId,
            userId: memberUserId,
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      costCentreId: z.string().optional(),
      description: z.string().optional(),
      endTime: z.number().optional(),
      feedbackDeadline: z.number().nullable().optional(),
      feedbackEnabled: z.boolean().optional(),
      id: z.string(),
      inheritVolunteers: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      location: z.string().optional(),
      name: z.string().min(1).optional(),
      now: z.number(),
      postEventNudgesEnabled: z.boolean().optional(),
      partners: eventPartnersSchema.optional(),
      postRsvpPoll: z.boolean().optional(),
      programmeId: z.string().optional(),
      // Finance only. Undefined keeps the stored project; null clears it.
      projectId: z.string().nullable().optional(),
      publicArea: z.string().max(80).optional(),
      reminderIntervals: reminderIntervalsSchema,
      reminderTarget: reminderTargetSchema,
      rsvpPollLeadMinutes: rsvpPollLeadMinutesSchema,
      startTime: z.number().optional(),
      volunteersNeeded: volunteersNeededSchema,
      // Undefined leaves the group alone; null removes it.
      whatsappGroupId: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.id);
      const effectiveStart = args.startTime ?? existing.startTime;
      const effectiveEnd = args.endTime;
      if (
        effectiveEnd !== undefined &&
        effectiveEnd !== null &&
        effectiveEnd <= effectiveStart
      ) {
        throw new Error("End time must be after start time");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.edit", isTeamLead);
      await assertProgrammeChange(tx, existing.programmeId, args.programmeId);
      const nextGroupId = await assertEventGroupChange(
        tx,
        existing,
        args.whatsappGroupId
      );
      await pickCostCentreId(tx, args.costCentreId, existing.costCentreId);
      const programmesBefore = await eventProgrammes(tx, [args.id]);
      const projectsBefore = await eventProjects(tx, [args.id]);
      const projectId = await eventProjectChange(tx, {
        canManageFinance: can(ctx, "finance.manage"),
        current: existing.projectId ?? null,
        programmeId: args.programmeId ?? existing.programmeId,
        programmeMoves:
          args.programmeId !== undefined &&
          args.programmeId !== existing.programmeId,
        requested: args.projectId,
      });
      await noticeProjectCleared(ctx, tx, {
        current: existing.projectId ?? null,
        event: { id: existing.id, name: args.name ?? existing.name },
        next: projectId,
        now: args.now,
      });

      await tx.mutate.teamEvent.update(
        buildUpdateFields({ ...args, projectId })
      );
      await assertEventProjectMovesAllowed(tx, projectsBefore);
      await clearLeadApprovalsOnMovedEvents(
        tx,
        ctx,
        programmesBefore,
        args.now
      );
      if (args.partners) {
        await replaceEventPartners(
          tx,
          args.id,
          existing.teamId,
          args.partners,
          args.now
        );
      }

      if (tx.location === "server") {
        const eventId = args.id;
        const eventName = args.name ?? existing.name;
        const startTime = args.startTime ?? existing.startTime;
        const location = args.location ?? existing.location ?? null;
        const { teamId } = existing;
        const updatedAt = args.now;
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", eventId)
        )) as TeamEventMember[];
        const eventMemberIds = eventMembers.map((m) => m.userId);
        // A new or switched group gets the current members; the old group
        // keeps its members, and removing the group removes no one.
        if (nextGroupId) {
          pushAddGroupMembersTask(ctx, {
            entityId: eventId,
            entityType: "event",
            groupId: nextGroupId,
            mutator: "updateTeamEvent",
            userIds: eventMemberIds,
          });
        }

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-updated",
              {
                eventId,
                eventMemberIds,
                eventName,
                location,
                startTime,
                teamId,
                updatedAt,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { eventId, eventName, mutator: "updateTeamEvent", teamId },
        });

        // Notify members when feedback is newly enabled on an already-ended event.
        // Limitation: if feedback is enabled at creation time, no notification fires
        // when the event ends naturally — would require a scheduled/cron mechanism.
        if (
          args.feedbackEnabled === true &&
          !existing.feedbackEnabled &&
          existing.endTime !== null &&
          existing.endTime < args.now
        ) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-feedback-open",
                {
                  eventId,
                  eventName,
                  memberUserIds: eventMemberIds,
                  openedAt: updatedAt,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventId,
              mutator: "updateTeamEvent:feedbackEnabled",
            },
          });
        }
      }
    }
  ),

  /** Update a series with edit mode: "this", "following", or "all". */
  updateSeries: defineMutator(
    z.object({
      costCentreId: z.string().optional(),
      description: z.string().optional(),
      endTime: z.number().optional(),
      feedbackDeadline: z.number().nullable().optional(),
      feedbackEnabled: z.boolean().optional(),
      id: z.string(),
      inheritVolunteers: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      location: z.string().optional(),
      mode: z.enum(["this", "following", "all"]),
      name: z.string().min(1).optional(),
      newExceptionId: z.string().optional(),
      newSeriesId: z.string().optional(),
      now: z.number(),
      originalDate: z.string().regex(ISO_DATE_RE).optional(),
      postEventNudgesEnabled: z.boolean().optional(),
      partners: eventPartnersSchema.optional(),
      postRsvpPoll: z.boolean().optional(),
      programmeId: z.string().optional(),
      // Finance only. Undefined keeps the stored project; null clears it.
      projectId: z.string().nullable().optional(),
      publicArea: z.string().max(80).optional(),
      recurrenceRule: recurrenceRuleSchema,
      reminderIntervals: reminderIntervalsSchema,
      reminderTarget: reminderTargetSchema,
      rsvpPollLeadMinutes: rsvpPollLeadMinutesSchema,
      startTime: z.number().optional(),
      volunteersNeeded: volunteersNeededSchema,
      // Undefined leaves the group alone; null removes it.
      whatsappGroupId: z.string().nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
      await assertEventNotManagedByKalakriti(tx, args.id);
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.edit", isTeamLead);
      const mode = seriesScope(args, existing);

      if (
        mode === "this" &&
        !existing.seriesId &&
        existing.recurrenceRule &&
        args.originalDate &&
        args.newExceptionId
      ) {
        await assertEventIdAvailable(tx, args.newExceptionId);
      }
      if (mode === "following" && args.originalDate && args.newSeriesId) {
        await assertEventIdAvailable(tx, args.newSeriesId);
      }

      await assertProgrammeChange(tx, existing.programmeId, args.programmeId);
      const nextGroupId = await assertEventGroupChange(
        tx,
        existing,
        args.whatsappGroupId
      );
      await pickCostCentreId(tx, args.costCentreId, existing.costCentreId);
      const programmeMoves =
        args.programmeId !== undefined &&
        args.programmeId !== existing.programmeId;
      const edit = {
        ...args,
        projectId: await eventProjectChange(tx, {
          canManageFinance: can(ctx, "finance.manage"),
          current: existing.projectId ?? null,
          programmeId: args.programmeId ?? existing.programmeId,
          programmeMoves,
          requested: args.projectId,
        }),
      };
      await noticeProjectCleared(ctx, tx, {
        current: existing.projectId ?? null,
        event: { id: existing.id, name: args.name ?? existing.name },
        next: edit.projectId,
        now: args.now,
      });
      // Programme changes are future-effective: once a series has started,
      // "all" would rewrite past sessions, so it is refused. Before that,
      // every session is still to come.
      if (
        mode === "all" &&
        programmeMoves &&
        (await seriesHasStarted(tx, existing, args.now))
      ) {
        throw new Error(
          'Past sessions keep their programme. Open a later session and edit "This and following" to change it from there.'
        );
      }

      // Requests on a session that changes programme lose their lead
      // approval: the series and every saved session, before and after.
      const programmeChanges =
        args.programmeId !== undefined &&
        args.programmeId !== existing.programmeId;
      const seriesRoot = existing.seriesId ?? existing.id;
      // Every session: for lead approvals on a programme move, and on the
      // server for the projects certificates hold.
      const seriesSessionIds =
        programmeChanges || tx.location === "server"
          ? (
              (await tx.run(
                zql.teamEvent.where("seriesId", seriesRoot)
              )) as TeamEvent[]
            ).map((session) => session.id)
          : [];
      const projectsBefore = await eventProjects(tx, [
        seriesRoot,
        args.id,
        ...seriesSessionIds,
      ]);
      const programmesBefore = programmeChanges
        ? await eventProgrammes(tx, [seriesRoot, args.id, ...seriesSessionIds])
        : new Map<string, null | string>();

      let movedOccurrenceIds: string[] = [];
      if (mode === "all") {
        const changes = changedSeriesArgs(edit, existing);
        // As the series was before this edit.
        const before = {
          programmeId: existing.programmeId,
          projectId: existing.projectId ?? null,
          startDate: seriesStartDate(existing.startTime),
        };
        const after = {
          programmeId: changes.programmeId ?? before.programmeId,
          projectId:
            changes.projectId === undefined
              ? before.projectId
              : changes.projectId,
        };
        await updateSeriesAll(tx, args, buildUpdateFields(edit));
        if (existing.recurrenceRule && !existing.seriesId) {
          // A live start-date row is the first session: it takes what the
          // edit changed, keeping its own details otherwise.
          const first = (await tx.run(
            zql.teamEvent
              .where("seriesId", args.id)
              .where("originalDate", before.startDate)
              .one()
          )) as TeamEvent | undefined;
          if (first && !first.cancelledAt) {
            // A moved start keeps the series' end with it. The project
            // follows the programme, as the other sessions' does below.
            const firstFollows =
              changes.programmeId !== undefined ||
              (first.programmeId === before.programmeId &&
                (first.projectId ?? null) === before.projectId);
            await tx.mutate.teamEvent.update({
              ...sessionFieldsFrom(
                {
                  ...(changes.startTime === undefined
                    ? changes
                    : { ...changes, endTime: args.endTime }),
                  projectId: undefined,
                },
                first
              ),
              ...(firstFollows &&
                (changes.programmeId !== undefined ||
                  changes.projectId !== undefined) && {
                  projectId: after.projectId,
                }),
            });
          }
          // A programme move is only reachable before the series starts
          // (guarded above); a project change follows at any time.
          if (
            changes.programmeId !== undefined ||
            changes.projectId !== undefined
          ) {
            await moveSeriesSessionsToProgramme(tx, {
              from: before,
              now: args.now,
              seriesId: args.id,
              to: after,
            });
          }
        }
        if (nextGroupId !== undefined) {
          movedOccurrenceIds = await moveSeriesOccurrencesToGroup(tx, {
            fromGroupId: existing.whatsappGroupId ?? null,
            now: args.now,
            seriesId: args.id,
            toGroupId: nextGroupId,
          });
        }
      } else if (mode === "this") {
        await updateSeriesThis(tx, edit, existing, ctx.userId);
      } else if (
        mode === "following" &&
        args.originalDate &&
        args.newSeriesId
      ) {
        movedOccurrenceIds = await updateSeriesFollowing(
          tx,
          {
            ...edit,
            newSeriesId: args.newSeriesId,
            originalDate: args.originalDate,
          },
          existing,
          ctx.userId
        );
      }
      await assertEventProjectMovesAllowed(tx, projectsBefore);

      await clearLeadApprovalsOnMovedEvents(
        tx,
        ctx,
        programmesBefore,
        args.now
      );

      const writeTarget = resolveSeriesWriteTarget({ ...args, mode }, existing);
      if (args.partners && writeTarget) {
        await replaceEventPartners(
          tx,
          writeTarget,
          existing.teamId,
          args.partners,
          args.now
        );
      }

      if (tx.location === "server" && nextGroupId && writeTarget) {
        await pushEventGroupMembersTask(tx, ctx, {
          eventId: writeTarget,
          groupId: nextGroupId,
          mutator: "updateTeamEventSeries",
          occurrenceIds: movedOccurrenceIds,
        });
      }
    }
  ),

  ...teamEventSocialMutators,
};

/**
 * The row an updateSeries call writes: the parent for "all", the exception
 * (existing or newly inserted) for "this", the new series for "following".
 */
export function resolveSeriesWriteTarget(
  args: {
    id: string;
    mode: "this" | "following" | "all";
    newExceptionId?: string;
    newSeriesId?: string;
    originalDate?: string;
  },
  existing: Pick<TeamEvent, "recurrenceRule" | "seriesId">
): string | undefined {
  if (args.mode === "all") {
    return args.id;
  }
  if (args.mode === "following") {
    return args.originalDate ? args.newSeriesId : undefined;
  }
  if (existing.seriesId) {
    return args.id;
  }
  return existing.recurrenceRule && args.originalDate
    ? args.newExceptionId
    : undefined;
}
