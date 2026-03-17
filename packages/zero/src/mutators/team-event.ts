import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type { TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

async function addUsersToEventWhatsAppGroup(
  whatsappGroupId: string,
  userIds: string[]
) {
  const { addUsersToWhatsAppGroup, getUserPhones } = await import(
    "@pi-dash/whatsapp"
  );
  const { db } = await import("@pi-dash/db");

  const group = await db.query.whatsappGroup.findFirst({
    where: (t, { eq }) => eq(t.id, whatsappGroupId),
  });
  if (!group) {
    return;
  }

  const phoneMap = await getUserPhones(userIds);
  const phones = [...phoneMap.values()];
  await addUsersToWhatsAppGroup(group.jid, phones);
}

interface UpdateArgs {
  description?: string;
  endTime?: number;
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
    ...(args.whatsappGroupId !== undefined && {
      whatsappGroupId: args.whatsappGroupId || null,
    }),
    updatedAt: args.now,
  };
}

const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(["weekly", "biweekly", "monthly"]),
    endDate: z.string().optional(),
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
      copyAllMembers: z.boolean().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      if (args.endTime !== undefined && args.endTime <= args.startTime) {
        throw new Error("End time must be after start time");
      }
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", args.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
        copyAllMembers: args.copyAllMembers ?? false,
        whatsappGroupId: args.whatsappGroupId ?? null,
        parentEventId: null,
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
            const { createWhatsAppGroup, getUserPhone } = await import(
              "@pi-dash/whatsapp"
            );
            const { db } = await import("@pi-dash/db");
            const { whatsappGroup } = await import(
              "@pi-dash/db/schema/whatsapp-group"
            );
            const { teamEvent } = await import("@pi-dash/db/schema/team-event");
            const { eq } = await import("drizzle-orm");

            const creatorPhone = await getUserPhone(creatorUserId);
            const participants = creatorPhone ? [creatorPhone] : [];
            const { jid } = await createWhatsAppGroup(eventName, participants);
            const groupId = crypto.randomUUID();
            const timestamp = new Date();

            await db.insert(whatsappGroup).values({
              id: groupId,
              name: eventName,
              jid,
              createdAt: timestamp,
              updatedAt: timestamp,
            });

            await db
              .update(teamEvent)
              .set({ whatsappGroupId: groupId })
              .where(eq(teamEvent.id, eventId));
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
            const { notifyEventCreated } = await import(
              "@pi-dash/notifications"
            );
            const { db } = await import("@pi-dash/db");

            const members = await db.query.teamMember.findMany({
              columns: { userId: true },
              where: (t, { eq }) => eq(t.teamId, teamId),
            });
            const teamMemberIds = members.map((m) => m.userId);

            await notifyEventCreated({
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", existing.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
            const { notifyEventUpdated } = await import(
              "@pi-dash/notifications"
            );

            await notifyEventUpdated({
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", existing.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
            const { notifyEventCancelled } = await import(
              "@pi-dash/notifications"
            );

            await notifyEventCancelled({
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
              const { addToWhatsAppGroup, getUserPhone } = await import(
                "@pi-dash/whatsapp"
              );
              const { db } = await import("@pi-dash/db");

              const group = await db.query.whatsappGroup.findFirst({
                where: (t, { eq }) => eq(t.id, whatsappGroupId),
              });
              if (group) {
                const phone = await getUserPhone(userId);
                if (phone) {
                  await addToWhatsAppGroup(group.jid, phone);
                }
              }
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
            const { notifyAddedToEvent } = await import(
              "@pi-dash/notifications"
            );
            await notifyAddedToEvent({
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
              await addUsersToEventWhatsAppGroup(whatsappGroupId, userIds);
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
            const { notifyUsersAddedToEvent } = await import(
              "@pi-dash/notifications"
            );
            await notifyUsersAddedToEvent({
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
      if (ctx.role !== "admin") {
        const membership = await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        );
        if (!membership) {
          throw new Error("Unauthorized");
        }
      }

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
              const { getUserPhone, removeFromWhatsAppGroup } = await import(
                "@pi-dash/whatsapp"
              );
              const { db } = await import("@pi-dash/db");

              const group = await db.query.whatsappGroup.findFirst({
                where: (t, { eq }) => eq(t.id, whatsappGroupId),
              });
              if (group) {
                const phone = await getUserPhone(memberUserId);
                if (phone) {
                  await removeFromWhatsAppGroup(group.jid, phone);
                }
              }
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
            const { notifyRemovedFromEvent } = await import(
              "@pi-dash/notifications"
            );
            await notifyRemovedFromEvent({
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
