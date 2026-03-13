import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import type { EventInterest, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

export const eventInterestMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      message: z.string().optional(),
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
      if (!event.isPublic) {
        throw new Error("Event is not public");
      }

      if (event.startTime <= args.now) {
        throw new Error(
          "Cannot show interest in an event that has already started"
        );
      }

      const existingMember = (await tx.run(
        zql.teamEventMember
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as TeamEventMember | undefined;
      if (existingMember) {
        throw new Error("Already a member of this event");
      }

      const existingInterest = (await tx.run(
        zql.eventInterest
          .where("eventId", args.eventId)
          .where("userId", ctx.userId)
          .one()
      )) as EventInterest | undefined;
      if (existingInterest) {
        throw new Error("Interest already submitted");
      }

      await tx.mutate.eventInterest.insert({
        id: args.id,
        eventId: args.eventId,
        userId: ctx.userId,
        status: "pending",
        message: args.message ?? null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: args.now,
      });

      if (tx.location === "server") {
        const eventId = args.eventId;
        const eventName = event.name;
        const teamId = event.teamId;
        const volunteerUserId = ctx.userId;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "createEventInterest",
            eventId,
            eventName,
            teamId,
            volunteerUserId,
          },
          fn: async () => {
            const { notifyEventInterestReceived } = await import(
              "@pi-dash/notifications"
            );
            const { db } = await import("@pi-dash/db");
            const { teamMember } = await import("@pi-dash/db/schema/team");
            const { user } = await import("@pi-dash/db/schema/auth");
            const { eq: eqOp, and: andOp } = await import("drizzle-orm");

            const leads = await db
              .select({ userId: teamMember.userId })
              .from(teamMember)
              .where(
                andOp(
                  eqOp(teamMember.teamId, teamId),
                  eqOp(teamMember.role, "lead")
                )
              );

            const volunteer = await db.query.user.findFirst({
              where: eqOp(user.id, volunteerUserId),
            });
            const volunteerName = volunteer?.name ?? "A volunteer";

            await notifyEventInterestReceived({
              eventId,
              eventName,
              leadUserIds: leads.map((l) => l.userId),
              teamId,
              volunteerName,
            });
          },
        });
      }
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const interest = (await tx.run(
        zql.eventInterest.where("id", args.id).one()
      )) as EventInterest | undefined;
      if (!interest) {
        throw new Error("Interest request not found");
      }
      if (interest.status !== "pending") {
        throw new Error("Interest is not pending");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", interest.eventId).one()
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

      const now = Date.now();
      await tx.mutate.eventInterest.update({
        id: args.id,
        status: "approved",
        reviewedBy: ctx.userId,
        reviewedAt: now,
      });

      const memberId = crypto.randomUUID();
      await tx.mutate.teamEventMember.insert({
        id: memberId,
        eventId: interest.eventId,
        userId: interest.userId,
        addedAt: now,
      });

      if (tx.location === "server") {
        const userId = interest.userId;
        const eventId = interest.eventId;
        const eventName = event.name;
        const whatsappGroupId = event.whatsappGroupId;

        if (whatsappGroupId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "approveEventInterest",
              eventId,
              userId,
              whatsappGroupId,
            },
            fn: async () => {
              const { addToWhatsAppGroup, getUserPhone } = await import(
                "@pi-dash/whatsapp"
              );
              const { db } = await import("@pi-dash/db");
              const { whatsappGroup } = await import(
                "@pi-dash/db/schema/whatsapp-group"
              );
              const { eq } = await import("drizzle-orm");

              const group = await db.query.whatsappGroup.findFirst({
                where: eq(whatsappGroup.id, whatsappGroupId),
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

        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveEventInterest",
            eventId,
            eventName,
            userId,
          },
          fn: async () => {
            const { notifyEventInterestApproved } = await import(
              "@pi-dash/notifications"
            );
            await notifyEventInterestApproved({
              eventId,
              eventName,
              userId,
            });
          },
        });
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const interest = (await tx.run(
        zql.eventInterest.where("id", args.id).one()
      )) as EventInterest | undefined;
      if (!interest) {
        throw new Error("Interest request not found");
      }
      if (interest.status !== "pending") {
        throw new Error("Interest is not pending");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", interest.eventId).one()
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

      await tx.mutate.eventInterest.update({
        id: args.id,
        status: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: Date.now(),
      });

      if (tx.location === "server") {
        const userId = interest.userId;
        const eventId = interest.eventId;
        const eventName = event.name;

        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectEventInterest",
            eventId,
            eventName,
            userId,
          },
          fn: async () => {
            const { notifyEventInterestRejected } = await import(
              "@pi-dash/notifications"
            );
            await notifyEventInterestRejected({
              eventId,
              eventName,
              userId,
            });
          },
        });
      }
    }
  ),

  cancel: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const interest = (await tx.run(
        zql.eventInterest.where("id", args.id).one()
      )) as EventInterest | undefined;
      if (!interest) {
        throw new Error("Interest request not found");
      }
      if (interest.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }
      if (interest.status !== "pending") {
        throw new Error("Only pending interests can be cancelled");
      }

      await tx.mutate.eventInterest.delete({ id: args.id });
    }
  ),
};
