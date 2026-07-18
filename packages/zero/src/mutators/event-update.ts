import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertEventUpdateContentMediaPolicy } from "../lib/event-update-content";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { EventUpdate, TeamEvent, TeamEventMember } from "../schema";
import { zql } from "../schema";

export const eventUpdateMutators = {
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
        reviewedAt: args.now,
        reviewedBy: ctx.userId,
        status: "approved",
      });

      if (tx.location === "server") {
        // Notify author that their update was approved
        if (existing.createdBy !== ctx.userId) {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-update-approved",
                {
                  authorId: existing.createdBy,
                  eventId: existing.eventId,
                  eventName: event.name,
                  eventUpdateId: args.id,
                  startTime: event.startTime,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventId: existing.eventId,
              eventUpdateId: args.id,
              mutator: "approveEventUpdate",
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
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-update-posted",
                {
                  authorName,
                  eventId: existing.eventId,
                  eventMemberIds,
                  eventName: event.name,
                  eventWhatsappGroupId: event.whatsappGroupId ?? null,
                  startTime: event.startTime,
                  teamWhatsappGroupId: teamRow?.whatsappGroupId ?? null,
                  updatedAt: args.now,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventUpdateId: args.id,
              mutator: "approveEventUpdate",
              notifyMembers: true,
            },
          });
        }
      }
    }
  ),
  create: defineMutator(
    z.object({
      content: z.string().min(1).max(50_000),
      eventId: z.string(),
      id: z.string(),
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

      assertEventUpdateContentMediaPolicy(args.content, {
        allowNewImages: isAdminOrLead,
      });

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
        content: args.content,
        createdAt: args.now,
        createdBy: ctx.userId,
        eventId: args.eventId,
        id: args.id,
        reviewedAt: isAdminOrLead ? args.now : null,
        reviewedBy: isAdminOrLead ? ctx.userId : null,
        status,
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
              fn: async () => {
                const { enqueue } = await import("@pi-dash/jobs/enqueue");
                await enqueue(
                  "notify-event-update-posted",
                  {
                    authorName,
                    eventId: args.eventId,
                    eventMemberIds,
                    eventName: event.name,
                    eventWhatsappGroupId: event.whatsappGroupId ?? null,
                    startTime: event.startTime,
                    teamWhatsappGroupId: teamRow?.whatsappGroupId ?? null,
                    updatedAt: args.now,
                  },
                  { traceId: ctx.traceId }
                );
              },
              meta: {
                eventId: args.eventId,
                eventName: event.name,
                eventUpdateId: args.id,
                mutator: "createEventUpdate",
              },
            });
          }
        } else {
          // Notify admins/leads about the pending update
          const author = await tx.run(zql.user.where("id", ctx.userId).one());
          const authorName = author?.name ?? "Someone";
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-event-update-pending",
                {
                  authorName,
                  eventId: args.eventId,
                  eventName: event.name,
                  eventUpdateId: args.id,
                  startTime: event.startTime,
                  teamId: event.teamId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              eventId: args.eventId,
              eventUpdateId: args.id,
              mutator: "createEventUpdate",
              pending: true,
            },
          });
        }
      }
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
        reviewedAt: args.now,
        reviewedBy: ctx.userId,
        status: "rejected",
      });

      if (tx.location === "server" && existing.createdBy !== ctx.userId) {
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-event-update-rejected",
              {
                authorId: existing.createdBy,
                eventId: existing.eventId,
                eventName: event.name,
                eventUpdateId: args.id,
                startTime: event.startTime,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            eventId: existing.eventId,
            eventUpdateId: args.id,
            mutator: "rejectEventUpdate",
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      content: z.string().min(1).max(50_000),
      id: z.string(),
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

      let canAddImages = can(ctx, "event_updates.create");
      if (!canAddImages) {
        const event = (await tx.run(
          zql.teamEvent.where("id", existing.eventId).one()
        )) as TeamEvent | undefined;
        if (!event) {
          throw new Error("Event not found");
        }
        canAddImages = !!(await tx.run(
          zql.teamMember
            .where("teamId", event.teamId)
            .where("userId", ctx.userId)
            .where("role", "lead")
            .one()
        ));
      }
      assertEventUpdateContentMediaPolicy(args.content, {
        allowNewImages: canAddImages,
        existingContent: existing.content,
      });

      await tx.mutate.eventUpdate.update({
        content: args.content,
        id: args.id,
        updatedAt: args.now,
      });
    }
  ),
};
