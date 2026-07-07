import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

export const whatsappGroupMutators = {
  create: defineMutator(
    z.object({
      description: z.string().optional(),
      id: z.string(),
      jid: z.string().min(1),
      name: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.whatsapp_groups");
      await tx.mutate.whatsappGroup.insert({
        createdAt: Date.now(),
        description: args.description,
        id: args.id,
        jid: args.jid,
        name: args.name,
        updatedAt: Date.now(),
      });
    }
  ),
  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.whatsapp_groups");
      const existing = await tx.run(
        zql.whatsappGroup.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("WhatsApp group not found");
      }
      await tx.mutate.whatsappGroup.delete({ id: args.id });
      // Clean up any appConfig rows referencing this group
      const configRows = await tx.run(zql.appConfig.where("value", args.id));
      await Promise.all(
        configRows.map(async (row) => {
          await tx.mutate.appConfig.delete({ key: row.key });
        })
      );
    }
  ),
  update: defineMutator(
    z.object({
      description: z.string().optional(),
      id: z.string(),
      jid: z.string().min(1),
      name: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.whatsapp_groups");
      const existing = await tx.run(
        zql.whatsappGroup.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("WhatsApp group not found");
      }
      await tx.mutate.whatsappGroup.update({
        description: args.description,
        id: args.id,
        jid: args.jid,
        name: args.name,
        updatedAt: Date.now(),
      });
    }
  ),
};
