import {
  COST_CENTRE_IDS,
  PROGRAMME_IDS,
  reminderTargetValues,
} from "@pi-dash/shared/constants";
import {
  REMINDER_PRESET_MINUTES,
  RSVP_POLL_LEAD_PRESET_MINUTES,
} from "@pi-dash/shared/event-reminders";
import { seriesStartDate } from "@pi-dash/shared/rrule-expand";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { TeamEvent, TeamEventMember } from "../schema";
import { type Schema, zql } from "../schema";
import { pickCostCentreId } from "./cost-centre-pick";
import { assertEventNotManagedByKalakriti } from "./kalakriti-event-guard";
import {
  buildUpdateFields,
  cancelSeriesAll,
  cancelSeriesFollowing,
  cancelSeriesThis,
  ISO_DATE_RE,
  moveSeriesOccurrencesToGroup,
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
    tx.run(zql.reimbursement.where("eventId", "IN", ids).one()),
    tx.run(zql.vendorPayment.where("eventId", "IN", ids).one()),
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
  // Without a date, a series parent means its first session.
  const occDate =
    args.occDate ??
    (event.recurrenceRule && !event.seriesId
      ? seriesStartDate(event.startTime)
      : undefined);
  if (!occDate) {
    if (event.startTime <= args.now) {
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
    if (existing.startTime <= args.now) {
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
    if (event.startTime <= args.now) {
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
  if (occStart <= args.now) {
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
    excludeRules: z.array(z.string().max(100)).max(10).optional(),
    exdates: z.array(z.string()).optional(),
    rrule: z.string(),
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

      if (
        existing.startTime <= args.now &&
        isTeamLead &&
        !can(ctx, "events.cancel")
      ) {
        throw new Error("Cannot cancel an event that has already started");
      }

      const { now } = args;
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

      // Team leads without events.cancel cannot cancel materialized (past) events
      if (isTeamLead && !can(ctx, "events.cancel")) {
        if (mode === "all") {
          const exceptions = (await tx.run(
            zql.teamEvent.where("seriesId", args.id)
          )) as TeamEvent[];
          if (exceptions.some((e) => e.startTime <= args.now)) {
            throw new Error("Cannot cancel a series with past events");
          }
        } else if (
          (mode === "this" || mode === "following") &&
          existing.startTime <= args.now
        ) {
          throw new Error("Cannot cancel an event that has already started");
        }
      }

      if (mode === "all") {
        await cancelSeriesAll(tx, args);
      } else if (mode === "this") {
        await cancelSeriesThis(tx, args, existing, ctx.userId);
      } else if (mode === "following" && args.originalDate) {
        await cancelSeriesFollowing(
          tx,
          { ...args, originalDate: args.originalDate },
          existing
        );
      }

      // Notification for cancel (all modes)
      if (tx.location === "server") {
        const eventId = args.id;
        const eventName = existing.name;
        const { teamId } = existing;
        const cancelledAt = args.now;
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
                eventId,
                eventName,
                reason,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { eventId, eventName, mutator: "cancelSeriesEvent", teamId },
        });
      }
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
        programmeId: await resolveProgrammeId(
          tx,
          args.programmeId,
          args.teamId
        ),
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
      if (event.startTime <= args.now) {
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

      await tx.mutate.teamEvent.update(buildUpdateFields(args));
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
      // Programme changes are future-effective: once a series has started,
      // "all" would rewrite past sessions, so it is refused. Before that,
      // every session is still to come.
      if (
        mode === "all" &&
        args.programmeId !== undefined &&
        args.programmeId !== existing.programmeId &&
        (await seriesHasStarted(tx, existing, args.now))
      ) {
        throw new Error(
          'Past sessions keep their programme. Open a later session and edit "This and following" to change it from there.'
        );
      }

      let movedOccurrenceIds: string[] = [];
      if (mode === "all") {
        await updateSeriesAll(tx, args, buildUpdateFields(args));
        // A live start-date row is the first session, so it takes the edit.
        if (existing.recurrenceRule && !existing.seriesId) {
          const first = (await tx.run(
            zql.teamEvent
              .where("seriesId", args.id)
              .where("originalDate", seriesStartDate(existing.startTime))
              .one()
          )) as TeamEvent | undefined;
          if (first && !first.cancelledAt) {
            await tx.mutate.teamEvent.update(sessionFieldsFrom(args, first));
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
        await updateSeriesThis(tx, args, existing, ctx.userId);
      } else if (
        mode === "following" &&
        args.originalDate &&
        args.newSeriesId
      ) {
        movedOccurrenceIds = await updateSeriesFollowing(
          tx,
          {
            ...args,
            newSeriesId: args.newSeriesId,
            originalDate: args.originalDate,
          },
          existing,
          ctx.userId
        );
      }

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
