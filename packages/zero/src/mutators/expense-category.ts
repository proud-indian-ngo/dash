import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

export const expenseCategoryMutators = {
  create: defineMutator(
    z.object({
      description: z.string().optional(),
      id: z.string(),
      name: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.expense_categories");
      await tx.mutate.expenseCategory.insert({
        createdAt: Date.now(),
        description: args.description ?? null,
        id: args.id,
        name: args.name,
        updatedAt: Date.now(),
      });
    }
  ),
  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.expense_categories");
      const existing = await tx.run(
        zql.expenseCategory.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Expense category not found");
      }
      await tx.mutate.expenseCategory.delete({ id: args.id });
    }
  ),
  update: defineMutator(
    z.object({
      description: z.string().optional(),
      id: z.string(),
      name: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.expense_categories");
      const existing = await tx.run(
        zql.expenseCategory.where("id", args.id).one()
      );
      if (!existing) {
        throw new Error("Expense category not found");
      }
      await tx.mutate.expenseCategory.update({
        description: args.description ?? null,
        id: args.id,
        name: args.name,
        updatedAt: Date.now(),
      });
    }
  ),
};
