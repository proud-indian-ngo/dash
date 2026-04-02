import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
} from "../permissions";
import type { TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

const UNTIL_RE = /UNTIL=[^;]+/;
const DASH_RE = /-/g;

/** Build a truncated RRULE string with UNTIL set to the day before splitDate. */
function buildTruncatedRRule(rruleStr: string, splitIsoDate: string): string {
  const splitDate = new Date(`${splitIsoDate}T00:00:00Z`);
  splitDate.setUTCDate(splitDate.getUTCDate() - 1);
  const untilStr = splitDate.toISOString().slice(0, 10).replace(DASH_RE, "");
  if (rruleStr.includes("UNTIL=")) {
    return rruleStr.replace(UNTIL_RE, `UNTIL=${untilStr}T235959Z`);
  }
  return `${rruleStr};UNTIL=${untilStr}T235959Z`;
}

type RecurrenceRuleValue = { rrule: string; exdates?: string[] } | null;

/** Build an exception insert payload inheriting from the series parent. */
function buildExceptionInsert(
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
    whatsappGroupId: string;
    cancelledAt: number | null;
  }> = {}
) {
  return {
    id,
    teamId: series.teamId,
    name: overrides.name ?? series.name,
    description: overrides.description ?? series.description ?? null,
    location: overrides.location ?? series.location ?? null,
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
    whatsappGroupId:
      overrides.whatsappGroupId ?? series.whatsappGroupId ?? null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

interface UpdateArgs {
  description?: string;
  endTime?: number;
  feedbackDeadline?: number | null;
  feedbackEnabled?: boolean;
  id: string;
  isPublic?: boolean;
  location?: string;
  name?: string;
  now: number;
  startTime?: number;
  whatsappGroupId?: string;
}

function buildUpdateFields(args: UpdateArgs) {
  return {
    id: args.id,
    ...(args.name !== undefined && { name: args.name }),
    ...(args.description !== undefined && {
      description: args.description || null,
    }),
    ...(args.location !== undefined && { location: args.location || null }),
    ...(args.startTime !== undefined && { startTime: args.startTime }),
    ...(args.endTime !== undefined && { endTime: args.endTime }),
    ...(args.isPublic !== undefined && { isPublic: args.isPublic }),
    ...(args.feedbackEnabled !== undefined && {
      feedbackEnabled: args.feedbackEnabled,
    }),
    ...(args.feedbackDeadline !== undefined && {
      feedbackDeadline: args.feedbackDeadline ?? null,
    }),
    ...(args.whatsappGroupId !== undefined && {
      whatsappGroupId: args.whatsappGroupId || null,
    }),
    updatedAt: args.now,
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const recurrenceRuleSchema = z
  .object({
    rrule: z.string(),
    exdates: z.array(z.string()).optional(),
  })
  .optional();

export const teamEventMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      teamId: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      location: z.string().optional(),
      startTime: z.number(),
      endTime: z.number().optional(),
      isPublic: z.boolean().optional(),
      recurrenceRule: recurrenceRuleSchema,
      whatsappGroupId: z.string().optional(),
      createWhatsAppGroup: z.boolean().optional(),
      feedbackEnabled: z.boolean().optional(),
      feedbackDeadline: z.number().nullable().optional(),
      now: z.number(),
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

      await tx.mutate.teamEvent.insert({
        id: args.id,
        teamId: args.teamId,
        name: args.name,
        description: args.description ?? null,
        location: args.location ?? null,
        startTime: args.startTime,
        endTime: args.endTime ?? null,
        isPublic: args.isPublic ?? false,
        recurrenceRule: args.recurrenceRule ?? null,
        feedbackEnabled: args.feedbackEnabled ?? false,
        feedbackDeadline: args.feedbackDeadline ?? null,
        whatsappGroupId: args.whatsappGroupId ?? null,
        seriesId: null,
        originalDate: null,
        cancelledAt: null,
        createdBy: ctx.userId,
        createdAt: args.now,
        updatedAt: args.now,
      });

      if (
        tx.location === "server" &&
        args.createWhatsAppGroup &&
        !args.whatsappGroupId
      ) {
        const eventId = args.id;
        const eventName = args.name;
        const creatorUserId = ctx.userId;
        ctx.asyncTasks?.push({
          meta: { mutator: "createTeamEvent", eventId, eventName },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("whatsapp-create-group", {
              entityType: "event",
              entityId: eventId,
              groupName: eventName,
              creatorUserId,
            });
          },
        });
      }

      if (tx.location === "server") {
        const eventId = args.id;
        const eventName = args.name;
        const startTime = args.startTime;
        const location = args.location;
        const teamId = args.teamId;
        const members = await tx.run(zql.teamMember.where("teamId", teamId));
        const teamMemberIds = members.map((m) => m.userId);
        ctx.asyncTasks?.push({
          meta: {
            mutator: "createTeamEvent",
            eventId,
            eventName,
            teamId,
            startTime,
            location,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-event-created", {
              eventId,
              eventName,
              location: location ?? null,
              startTime,
              teamId,
              teamMemberIds,
            });
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      now: z.number(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      isPublic: z.boolean().optional(),
      feedbackEnabled: z.boolean().optional(),
      feedbackDeadline: z.number().nullable().optional(),
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
      const effectiveEnd = args.endTime ?? existing.endTime;
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
        const location = args.location ?? existing.location;
        const teamId = existing.teamId;
        const updatedAt = args.now;
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", eventId)
        )) as TeamEventMember[];
        const eventMemberIds = eventMembers.map((m) => m.userId);

        ctx.asyncTasks?.push({
          meta: { mutator: "updateTeamEvent", eventId, eventName, teamId },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-event-updated", {
              eventId,
              eventMemberIds,
              eventName,
              location: location ?? null,
              startTime,
              teamId,
              updatedAt,
            });
          },
        });

        // Notify members when feedback is newly enabled on an already-ended event.
        // Limitation: if feedback is enabled at creation time, no notification fires
        // when the event ends naturally — would require a scheduled/cron mechanism.
        if (
          args.feedbackEnabled === true &&
          !existing.feedbackEnabled &&
          (existing.endTime ?? existing.startTime) < args.now
        ) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "updateTeamEvent:feedbackEnabled",
              eventId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs");
              await enqueue("notify-event-feedback-open", {
                eventId,
                eventName,
                memberUserIds: eventMemberIds,
              });
            },
          });
        }
      }
    }
  ),

  cancel: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
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

      if (existing.startTime <= args.now) {
        throw new Error("Cannot cancel an event that has already started");
      }

      const now = args.now;
      await tx.mutate.teamEvent.update({
        id: args.id,
        cancelledAt: now,
        updatedAt: now,
      });

      if (tx.location === "server") {
        const eventId = args.id;
        const eventName = existing.name;
        const teamId = existing.teamId;
        const cancelledAt = now;
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", eventId)
        )) as TeamEventMember[];
        const eventMemberIds = eventMembers.map((m) => m.userId);

        ctx.asyncTasks?.push({
          meta: { mutator: "cancelTeamEvent", eventId, eventName, teamId },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-event-cancelled", {
              cancelledAt,
              eventId,
              eventMemberIds,
              eventName,
              teamId,
            });
          },
        });
      }
    }
  ),

  /** Materialize a virtual occurrence into an exception row. */
  materialize: defineMutator(
    z.object({
      id: z.string(),
      seriesId: z.string(),
      originalDate: z.string().regex(ISO_DATE_RE),
      now: z.number(),
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

      await tx.mutate.teamEvent.insert({
        id: args.id,
        teamId: series.teamId,
        name: series.name,
        description: series.description,
        location: series.location,
        startTime: series.startTime,
        endTime: series.endTime,
        isPublic: series.isPublic,
        recurrenceRule: null,
        seriesId: args.seriesId,
        originalDate: args.originalDate,
        cancelledAt: null,
        feedbackEnabled: series.feedbackEnabled,
        feedbackDeadline: series.feedbackDeadline,
        whatsappGroupId: series.whatsappGroupId,
        createdBy: ctx.userId,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  ),

  /** Update a series with edit mode: "this", "following", or "all". */
  updateSeries: defineMutator(
    z.object({
      id: z.string(),
      mode: z.enum(["this", "following", "all"]),
      originalDate: z.string().regex(ISO_DATE_RE).optional(),
      newExceptionId: z.string().optional(),
      newSeriesId: z.string().optional(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      now: z.number(),
      startTime: z.number().optional(),
      endTime: z.number().optional(),
      isPublic: z.boolean().optional(),
      recurrenceRule: recurrenceRuleSchema,
      feedbackEnabled: z.boolean().optional(),
      feedbackDeadline: z.number().nullable().optional(),
      whatsappGroupId: z.string().optional(),
    }),
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 3-mode dispatch (this/following/all) with auth is inherently branchy
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
        await tx.mutate.teamEvent.update({
          ...buildUpdateFields(args),
          ...(args.recurrenceRule !== undefined && {
            recurrenceRule: args.recurrenceRule ?? null,
          }),
        });
        return;
      }

      if (args.mode === "this") {
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
              ctx.userId,
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
                whatsappGroupId: args.whatsappGroupId,
              }
            )
          );
        }
        return;
      }

      if (args.mode === "following" && args.originalDate && args.newSeriesId) {
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
          whatsappGroupId:
            args.whatsappGroupId ?? existing.whatsappGroupId ?? null,
          createdBy: ctx.userId,
          createdAt: args.now,
          updatedAt: args.now,
        });
      }
    }
  ),

  /** Cancel with mode: "this", "following", or "all". */
  cancelSeries: defineMutator(
    z.object({
      id: z.string(),
      mode: z.enum(["this", "following", "all"]),
      originalDate: z.string().regex(ISO_DATE_RE).optional(),
      newExceptionId: z.string().optional(),
      now: z.number(),
    }),
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 3-mode dispatch (this/following/all) with auth and notifications is inherently branchy
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

      const now = args.now;

      if (args.mode === "all") {
        await tx.mutate.teamEvent.update({
          id: args.id,
          cancelledAt: now,
          updatedAt: now,
        });
        const exceptions = (await tx.run(
          zql.teamEvent.where("seriesId", args.id)
        )) as TeamEvent[];
        for (const exc of exceptions) {
          if (!exc.cancelledAt) {
            await tx.mutate.teamEvent.update({
              id: exc.id,
              cancelledAt: now,
              updatedAt: now,
            });
          }
        }
      }

      if (args.mode === "this") {
        if (existing.seriesId || !existing.recurrenceRule) {
          await tx.mutate.teamEvent.update({
            id: args.id,
            cancelledAt: now,
            updatedAt: now,
          });
        } else if (args.originalDate && args.newExceptionId) {
          await tx.mutate.teamEvent.insert(
            buildExceptionInsert(
              args.newExceptionId,
              existing,
              args.originalDate,
              ctx.userId,
              now,
              { cancelledAt: now }
            )
          );
        }
      }

      if (args.mode === "following" && args.originalDate) {
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
          updatedAt: now,
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
              cancelledAt: now,
              updatedAt: now,
            });
          }
        }
      }

      // Notification for cancel (all modes)
      if (tx.location === "server") {
        const eventId = args.id;
        const eventName = existing.name;
        const teamId = existing.teamId;
        const cancelledAt = now;
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", eventId)
        )) as TeamEventMember[];
        const eventMemberIds = eventMembers.map((m) => m.userId);

        ctx.asyncTasks?.push({
          meta: { mutator: "cancelSeriesEvent", eventId, eventName, teamId },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-event-cancelled", {
              cancelledAt,
              eventId,
              eventMemberIds,
              eventName,
              teamId,
            });
          },
        });
      }
    }
  ),

  addMember: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
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
        id: args.id,
        eventId: args.eventId,
        userId: args.userId,
        addedAt: args.now,
      });

      if (tx.location === "server") {
        const userId = args.userId;
        const whatsappGroupId = event.whatsappGroupId;
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "addEventMember",
              eventId: args.eventId,
              userId,
              whatsappGroupId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs");
              await enqueue("whatsapp-add-member", {
                groupId: whatsappGroupId,
                userId,
              });
            },
          });
        }

        const eventId = args.eventId;
        const eventName = event.name;
        const startTime = event.startTime;
        const location = event.location;
        const teamId = event.teamId;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "addEventMember",
            eventId,
            eventName,
            userId,
            teamId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-added-to-event", {
              eventId,
              eventName,
              location: location ?? null,
              startTime,
              teamId,
              userId,
            });
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

      for (const member of args.members) {
        const existing = await tx.run(
          zql.teamEventMember
            .where("eventId", args.eventId)
            .where("userId", member.userId)
            .one()
        );
        if (!existing) {
          await tx.mutate.teamEventMember.insert({
            id: member.id,
            eventId: args.eventId,
            userId: member.userId,
            addedAt: args.now,
          });
        }
      }

      if (tx.location === "server") {
        const whatsappGroupId = event.whatsappGroupId;
        const userIds = args.members.map((m) => m.userId);
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "addEventMembers",
              whatsappGroupId,
              userCount: userIds.length,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs");
              await enqueue("whatsapp-add-members", {
                groupId: whatsappGroupId,
                userIds,
              });
            },
          });
        }

        const eventId = args.eventId;
        const eventName = event.name;
        const startTime = event.startTime;
        const location = event.location;
        const teamId = event.teamId;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "addEventMembers",
            eventId,
            eventName,
            teamId,
            userCount: userIds.length,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-users-added-to-event", {
              userIds,
              eventId,
              eventName,
              startTime,
              location: location ?? null,
              teamId,
            });
          },
        });
      }
    }
  ),

  markAttendance: defineMutator(
    z.object({
      eventId: z.string(),
      memberId: z.string(),
      attendance: z.enum(["present", "absent"]).nullable(),
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
        id: args.memberId,
        attendance: args.attendance,
        attendanceMarkedAt: args.now,
        attendanceMarkedBy: ctx.userId,
      });
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

      for (const member of members) {
        await tx.mutate.teamEventMember.update({
          id: member.id,
          attendance: "present",
          attendanceMarkedAt: args.now,
          attendanceMarkedBy: ctx.userId,
        });
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
        const whatsappGroupId = event.whatsappGroupId;
        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "removeEventMember",
              memberUserId,
              whatsappGroupId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs");
              await enqueue("whatsapp-remove-member", {
                groupId: whatsappGroupId,
                userId: memberUserId,
              });
            },
          });
        }

        const eventId = args.eventId;
        const eventName = event.name;
        const teamId = event.teamId;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "removeEventMember",
            eventId,
            eventName,
            teamId,
            userId: memberUserId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-removed-from-event", {
              eventId,
              eventName,
              teamId,
              userId: memberUserId,
            });
          },
        });
      }
    }
  ),
};
