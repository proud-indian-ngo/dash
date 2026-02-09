import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsAdmin } from "../permissions";
import { zql } from "../schema";

export const expenseCategoryMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      await tx.mutate.expenseCategory.insert({
        id: args.id,
        name: args.name,
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
      description: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const existing = await tx.run(
        zql.expenseCategory.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Expense category not found");
      }
      await tx.mutate.expenseCategory.update({
        id: args.id,
        name: args.name,
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
        zql.expenseCategory.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Expense category not found");
      }
      await tx.mutate.expenseCategory.delete({ id: args.id });
    }
  ),
};
