import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
} from "../permissions";
import type { TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

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
            const { db } = await import("@pi-dash/db");

            const members = await db.query.teamMember.findMany({
              columns: { userId: true },
              where: (t, { eq }) => eq(t.teamId, teamId),
            });
            const teamMemberIds = members.map((m) => m.userId);

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
