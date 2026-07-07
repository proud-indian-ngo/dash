import { cityValues, reminderTargetValues } from "@pi-dash/shared/constants";
import {
  REMINDER_PRESET_MINUTES,
  RSVP_POLL_LEAD_PRESET_MINUTES,
} from "@pi-dash/shared/event-reminders";
import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";
import {
  buildUpdateFields,
  cancelSeriesAll,
  cancelSeriesFollowing,
  cancelSeriesThis,
  ISO_DATE_RE,
  type Tx,
  updateSeriesAll,
  updateSeriesFollowing,
  updateSeriesThis,
} from "./team-event-series";

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
    // biome-ignore lint/suspicious/noExplicitAny: matches Zero's internal push signature
    push: (task: any) => void;
  };
  traceId?: string;
  userId: string;
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

async function resolveJoinTarget(
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
  if (!args.occDate) {
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
  if (!args.materializedId) {
    throw new Error("materializedId required for virtual occurrence");
  }
  const existing = (await tx.run(
    zql.teamEvent
      .where("seriesId", args.eventId)
      .where("originalDate", args.occDate)
      .one()
  )) as TeamEvent | undefined;
  if (existing) {
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
  const occStart = computeOccurrenceStart(event.startTime, args.occDate);
  if (occStart <= args.now) {
    throw new Error("Cannot join event that has already started");
  }
  const duration =
    event.endTime === null ? null : event.endTime - event.startTime;
  const occEnd = duration === null ? null : occStart + duration;
  await tx.mutate.teamEvent.insert({
    cancelledAt: null,
    city: event.city,
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
    originalDate: args.occDate,
    postEventNudgesEnabled: event.postEventNudgesEnabled,
    postRsvpPoll: event.postRsvpPoll,
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
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.cancel", isTeamLead);

      // Team leads without events.cancel cannot cancel materialized (past) events
      if (isTeamLead && !can(ctx, "events.cancel")) {
        if (args.mode === "all") {
          const exceptions = (await tx.run(
            zql.teamEvent.where("seriesId", args.id)
          )) as TeamEvent[];
          if (exceptions.some((e) => e.startTime <= args.now)) {
            throw new Error("Cannot cancel a series with past events");
          }
        } else if (
          (args.mode === "this" || args.mode === "following") &&
          existing.startTime <= args.now
        ) {
          throw new Error("Cannot cancel an event that has already started");
        }
      }

      if (args.mode === "all") {
        await cancelSeriesAll(tx, args);
      } else if (args.mode === "this") {
        await cancelSeriesThis(tx, args, existing, ctx.userId);
      } else if (args.mode === "following" && args.originalDate) {
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
      city: z.enum(cityValues).optional(),
      createWhatsAppGroup: z.boolean().optional(),
      description: z.string().optional(),
      endTime: z.number().optional(),
      feedbackDeadline: z.number().nullable().optional(),
      feedbackEnabled: z.boolean().optional(),
      id: z.string(),
      inheritVolunteers: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      location: z.string().optional(),
      name: z.string().min(1),
      now: z.number(),
      postEventNudgesEnabled: z.boolean().optional(),
      postRsvpPoll: z.boolean().optional(),
      recurrenceRule: recurrenceRuleSchema,
      reminderIntervals: reminderIntervalsSchema,
      reminderTarget: reminderTargetSchema,
      rsvpPollLeadMinutes: rsvpPollLeadMinutesSchema,
      startTime: z.number(),
      teamId: z.string(),
      whatsappGroupId: z.string().optional(),
    }),
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: insert maps many optional fields + server-side tasks
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

      await tx.mutate.teamEvent.insert({
        cancelledAt: null,
        city: args.city,
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
        recurrenceRule: args.recurrenceRule,
        reminderIntervals: args.reminderIntervals,
        reminderTarget: args.reminderTarget,
        rsvpPollLeadMinutes: args.rsvpPollLeadMinutes,
        seriesId: null,
        startTime: args.startTime,
        teamId: args.teamId,
        updatedAt: args.now,
        whatsappGroupId: args.whatsappGroupId,
      });

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

      const occStart = computeOccurrenceStart(
        series.startTime,
        args.originalDate
      );
      const duration =
        series.endTime === null ? null : series.endTime - series.startTime;
      const occEnd = duration === null ? null : occStart + duration;

      await tx.mutate.teamEvent.insert({
        cancelledAt: null,
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
        name: series.name,
        originalDate: args.originalDate,
        postRsvpPoll: series.postRsvpPoll,
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
      city: z.enum(cityValues).optional(),
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
      postRsvpPoll: z.boolean().optional(),
      reminderIntervals: reminderIntervalsSchema,
      reminderTarget: reminderTargetSchema,
      rsvpPollLeadMinutes: rsvpPollLeadMinutesSchema,
      startTime: z.number().optional(),
      whatsappGroupId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
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

      await tx.mutate.teamEvent.update(buildUpdateFields(args));

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
      city: z.enum(cityValues).optional(),
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
      postRsvpPoll: z.boolean().optional(),
      recurrenceRule: recurrenceRuleSchema,
      reminderIntervals: reminderIntervalsSchema,
      reminderTarget: reminderTargetSchema,
      rsvpPollLeadMinutes: rsvpPollLeadMinutesSchema,
      startTime: z.number().optional(),
      whatsappGroupId: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = (await tx.run(
        zql.teamEvent.where("id", args.id).one()
      )) as TeamEvent | undefined;
      if (!existing) {
        throw new Error("Event not found");
      }
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", existing.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.edit", isTeamLead);

      if (args.mode === "all") {
        await updateSeriesAll(tx, args, buildUpdateFields(args));
      } else if (args.mode === "this") {
        await updateSeriesThis(tx, args, existing, ctx.userId);
      } else if (
        args.mode === "following" &&
        args.originalDate &&
        args.newSeriesId
      ) {
        await updateSeriesFollowing(
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
    }
  ),
};
