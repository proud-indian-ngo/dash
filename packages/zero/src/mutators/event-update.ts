import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { EventUpdate, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

export const eventUpdateMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      content: z.string().min(1).max(50_000),
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
        throw new Error("Cannot post updates before event starts");
      }

      // Check permission or team lead for auto-approval
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      const isAdminOrLead = can(ctx, "event_updates.create") || isTeamLead;

      // If not admin/lead, require event membership
      if (!isAdminOrLead) {
        const member = (await tx.run(
          zql.teamEventMember
            .where("eventId", args.eventId)
            .where("userId", ctx.userId)
            .one()
        )) as TeamEventMember | undefined;
        if (!member) {
          throw new Error("Must be an event member to post updates");
        }
      }

      const status = isAdminOrLead ? "approved" : "pending";

      await tx.mutate.eventUpdate.insert({
        id: args.id,
        eventId: args.eventId,
        content: args.content,
        status,
        createdBy: ctx.userId,
        reviewedBy: isAdminOrLead ? ctx.userId : null,
        reviewedAt: isAdminOrLead ? args.now : null,
        createdAt: args.now,
        updatedAt: args.now,
      });

      if (tx.location === "server") {
        if (status === "approved") {
          // Notify all event members about the new update
          const eventMembers = (await tx.run(
            zql.teamEventMember.where("eventId", args.eventId)
          )) as TeamEventMember[];
          const eventMemberIds = eventMembers
            .map((m) => m.userId)
            .filter((id) => id !== ctx.userId);

          if (eventMemberIds.length > 0) {
            const author = await tx.run(zql.user.where("id", ctx.userId).one());
            const authorName = author?.name ?? "Someone";
            const teamRow = (await tx.run(
              zql.team.where("id", event.teamId).one()
            )) as { whatsappGroupId: string | null } | undefined;
            ctx.asyncTasks?.push({
              meta: {
                mutator: "createEventUpdate",
                eventUpdateId: args.id,
                eventId: args.eventId,
                eventName: event.name,
              },
              fn: async () => {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");
                await enqueue(
                  "notify-event-update-posted",
                  {
                    eventId: args.eventId,
                    eventName: event.name,
                    eventMemberIds,
                    authorName,
                    eventWhatsappGroupId: event.whatsappGroupId ?? null,
                    startTime: event.startTime,
                    teamWhatsappGroupId: teamRow?.whatsappGroupId ?? null,
                    updatedAt: args.now,
                  },
                  { traceId: ctx.traceId }
                );
              },
            });
          }
        } else {
          // Notify admins/leads about the pending update
          const author = await tx.run(zql.user.where("id", ctx.userId).one());
          const authorName = author?.name ?? "Someone";
          ctx.asyncTasks?.push({
            meta: {
              mutator: "createEventUpdate",
              eventUpdateId: args.id,
              eventId: args.eventId,
              pending: true,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-update-pending",
                {
                  eventUpdateId: args.id,
                  eventId: args.eventId,
                  eventName: event.name,
                  authorName,
                  startTime: event.startTime,
                  teamId: event.teamId,
                },
                { traceId: ctx.traceId }
              );
            },
          });
        }
      }
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const existing = (await tx.run(
        zql.eventUpdate.where("id", args.id).one()
      )) as EventUpdate | undefined;
      if (!existing) {
        throw new Error("Update not found");
      }
      if (existing.status !== "pending") {
        throw new Error("Update is not pending");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", existing.eventId).one()
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
      assertHasPermissionOrTeamLead(ctx, "event_updates.approve", isTeamLead);

      await tx.mutate.eventUpdate.update({
        id: args.id,
        status: "approved",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server") {
        // Notify author that their update was approved
        if (existing.createdBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "approveEventUpdate",
              eventUpdateId: args.id,
              eventId: existing.eventId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-update-approved",
                {
                  eventUpdateId: args.id,
                  eventId: existing.eventId,
                  eventName: event.name,
                  authorId: existing.createdBy,
                  startTime: event.startTime,
                },
                { traceId: ctx.traceId }
              );
            },
          });
        }

        // Notify all event members about the new update
        const eventMembers = (await tx.run(
          zql.teamEventMember.where("eventId", existing.eventId)
        )) as TeamEventMember[];
        const eventMemberIds = eventMembers
          .map((m) => m.userId)
          .filter((id) => id !== existing.createdBy);

        if (eventMemberIds.length > 0) {
          const author = await tx.run(
            zql.user.where("id", existing.createdBy).one()
          );
          const authorName = author?.name ?? "Someone";
          const teamRow = (await tx.run(
            zql.team.where("id", event.teamId).one()
          )) as { whatsappGroupId: string | null } | undefined;
          ctx.asyncTasks?.push({
            meta: {
              mutator: "approveEventUpdate",
              eventUpdateId: args.id,
              notifyMembers: true,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-update-posted",
                {
                  eventId: existing.eventId,
                  eventName: event.name,
                  eventMemberIds,
                  authorName,
                  eventWhatsappGroupId: event.whatsappGroupId ?? null,
                  startTime: event.startTime,
                  teamWhatsappGroupId: teamRow?.whatsappGroupId ?? null,
                  updatedAt: args.now,
                },
                { traceId: ctx.traceId }
              );
            },
          });
        }
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const existing = (await tx.run(
        zql.eventUpdate.where("id", args.id).one()
      )) as EventUpdate | undefined;
      if (!existing) {
        throw new Error("Update not found");
      }
      if (existing.status !== "pending") {
        throw new Error("Update is not pending");
      }

      const event = (await tx.run(
        zql.teamEvent.where("id", existing.eventId).one()
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
      assertHasPermissionOrTeamLead(ctx, "event_updates.approve", isTeamLead);

      await tx.mutate.eventUpdate.update({
        id: args.id,
        status: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: args.now,
      });

      if (tx.location === "server" && existing.createdBy !== ctx.userId) {
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectEventUpdate",
            eventUpdateId: args.id,
            eventId: existing.eventId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-update-rejected",
              {
                eventUpdateId: args.id,
                eventId: existing.eventId,
                eventName: event.name,
                authorId: existing.createdBy,
                startTime: event.startTime,
              },
              { traceId: ctx.traceId }
            );
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      content: z.string().min(1).max(50_000),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const existing = (await tx.run(
        zql.eventUpdate.where("id", args.id).one()
      )) as EventUpdate | undefined;
      if (!existing) {
        throw new Error("Update not found");
      }

      if (existing.status === "rejected") {
        throw new Error("Cannot edit a rejected update");
      }

      // Permission: edit_all or own author + edit_own
      const isAuthor = existing.createdBy === ctx.userId;
      if (
        !(
          can(ctx, "event_updates.edit_all") ||
          (isAuthor && can(ctx, "event_updates.edit_own"))
        )
      ) {
        throw new Error("Unauthorized");
      }

      // Non-approvers cannot edit approved updates (prevents post-approval content swap)
      if (
        existing.status === "approved" &&
        !can(ctx, "event_updates.edit_all")
      ) {
        throw new Error("Cannot edit an approved update");
      }

      await tx.mutate.eventUpdate.update({
        id: args.id,
        content: args.content,
        updatedAt: args.now,
      });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);

      const existing = (await tx.run(
        zql.eventUpdate.where("id", args.id).one()
      )) as EventUpdate | undefined;
      if (!existing) {
        throw new Error("Update not found");
      }

      // Allow author to delete their own pending or rejected updates
      const isOwnPendingOrRejected =
        existing.createdBy === ctx.userId &&
        (existing.status === "pending" || existing.status === "rejected");

      if (!isOwnPendingOrRejected) {
        // Permission: delete_all or own author + delete_own
        const isAuthor = existing.createdBy === ctx.userId;
        if (
          !(
            can(ctx, "event_updates.delete_all") ||
            (isAuthor && can(ctx, "event_updates.delete_own"))
          )
        ) {
          throw new Error("Unauthorized");
        }
      }

      await tx.mutate.eventUpdate.delete({ id: args.id });
    }
  ),
};
