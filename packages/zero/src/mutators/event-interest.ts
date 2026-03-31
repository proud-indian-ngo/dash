import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
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

      if (can(ctx, "events.manage_interest")) {
        throw new Error(
          "Users who manage interest cannot submit interest requests"
        );
      }

      const teamMembership = await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .one()
      );
      if (teamMembership) {
        throw new Error("Team members cannot submit interest requests");
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
            const { enqueue } = await import("@pi-dash/jobs");
            const { db } = await import("@pi-dash/db");

            const leads = await db.query.teamMember.findMany({
              columns: { userId: true },
              where: (t, { eq, and }) =>
                and(eq(t.teamId, teamId), eq(t.role, "lead")),
            });

            const volunteer = await db.query.user.findFirst({
              where: (t, { eq }) => eq(t.id, volunteerUserId),
            });
            const volunteerName = volunteer?.name ?? "A volunteer";

            await enqueue("notify-event-interest-received", {
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
    z.object({ id: z.string(), now: z.number() }),
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

      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_interest", isTeamLead);

      await tx.mutate.eventInterest.update({
        id: args.id,
        status: "approved",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      const memberId = crypto.randomUUID();
      await tx.mutate.teamEventMember.insert({
        id: memberId,
        eventId: interest.eventId,
        userId: interest.userId,
        addedAt: args.now,
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
              const { enqueue } = await import("@pi-dash/jobs");
              await enqueue("whatsapp-add-member", {
                groupId: whatsappGroupId,
                userId,
              });
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
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-event-interest-approved", {
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
    z.object({ id: z.string(), now: z.number() }),
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

      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "events.manage_interest", isTeamLead);

      await tx.mutate.eventInterest.update({
        id: args.id,
        status: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
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
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-event-interest-rejected", {
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
