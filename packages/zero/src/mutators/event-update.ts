import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "../permissions";
import type { EventUpdate, TeamEvent } from "../schema";
import { zql } from "../schema";

export const eventUpdateMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      content: z.string().min(1),
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

      // Permission: admin or team lead
      const isTeamLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", event.teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      assertHasPermissionOrTeamLead(ctx, "event_updates.create", isTeamLead);

      await tx.mutate.eventUpdate.insert({
        id: args.id,
        eventId: args.eventId,
        content: args.content,
        createdBy: ctx.userId,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      content: z.string().min(1),
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

      await tx.mutate.eventUpdate.delete({ id: args.id });
    }
  ),
};
