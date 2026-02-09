import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsAdmin } from "../permissions";
import { zql } from "../schema";

export const whatsappGroupMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      jid: z.string().min(1),
      description: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      await tx.mutate.whatsappGroup.insert({
        id: args.id,
        name: args.name,
        jid: args.jid,
        description: args.description ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  ),
  update: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      jid: z.string().min(1),
      description: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const existing = await tx.run(
        zql.whatsappGroup.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("WhatsApp group not found");
      }
      await tx.mutate.whatsappGroup.update({
        id: args.id,
        name: args.name,
        jid: args.jid,
        description: args.description ?? null,
        updatedAt: Date.now(),
      });
    }
  ),
  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const existing = await tx.run(
        zql.whatsappGroup.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("WhatsApp group not found");
      }
      await tx.mutate.whatsappGroup.delete({ id: args.id });
      // Clean up any appConfig rows referencing this group
      const configRows = await tx.run(zql.appConfig.where("value", args.id));
      for (const row of configRows) {
        await tx.mutate.appConfig.delete({ key: row.key });
      }
    }
  ),
};
