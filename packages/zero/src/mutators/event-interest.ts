import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
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
        reviewedAt: args.now,
        reviewedBy: ctx.userId,
        status: "approved",
      });

      const memberId = uuidv7();
      await tx.mutate.teamEventMember.insert({
        addedAt: args.now,
        eventId: interest.eventId,
        id: memberId,
        userId: interest.userId,
      });

      if (tx.location === "server") {
        const { userId } = interest;
        const { eventId } = interest;
        const eventName = event.name;
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
              eventId,
              mutator: "approveEventInterest",
              userId,
              whatsappGroupId,
            },
          });
        }

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-interest-approved",
              {
                eventId,
                eventName,
                userId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "approveEventInterest",
            userId,
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
  create: defineMutator(
    z.object({
      eventId: z.string(),
      id: z.string(),
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
        createdAt: args.now,
        eventId: args.eventId,
        id: args.id,
        message: args.message,
        reviewedAt: null,
        reviewedBy: null,
        status: "pending",
        userId: ctx.userId,
      });

      if (tx.location === "server") {
        const { eventId } = args;
        const eventName = event.name;
        const { teamId } = event;
        const volunteerUserId = ctx.userId;
        const leads = await tx.run(
          zql.teamMember.where("teamId", teamId).where("role", "lead")
        );
        const leadUserIds = leads.map((l) => l.userId);
        const volunteer = await tx.run(
          zql.user.where("id", volunteerUserId).one()
        );
        const volunteerName = volunteer?.name;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-interest-received",
              {
                eventId,
                eventName,
                leadUserIds,
                teamId,
                volunteerName: volunteerName ?? "Someone",
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "createEventInterest",
            teamId,
            volunteerUserId,
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
        reviewedAt: args.now,
        reviewedBy: ctx.userId,
        status: "rejected",
      });

      if (tx.location === "server") {
        const { userId } = interest;
        const { eventId } = interest;
        const eventName = event.name;

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-interest-rejected",
              {
                eventId,
                eventName,
                userId,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId,
            eventName,
            mutator: "rejectEventInterest",
            userId,
          },
        });
      }
    }
  ),
};
