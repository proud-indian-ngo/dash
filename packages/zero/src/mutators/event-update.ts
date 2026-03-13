import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
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

      // Permission: admin or original author
      if (ctx.role !== "admin" && existing.createdBy !== ctx.userId) {
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

      if (ctx.role !== "admin" && existing.createdBy !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      await tx.mutate.eventUpdate.delete({ id: args.id });
    }
  ),
};
