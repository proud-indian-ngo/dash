import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

export const bankAccountMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      accountName: z.string(),
      accountNumber: z.string(),
      ifscCode: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const existing = await tx.run(
        zql.bankAccount.where("userId", ctx.userId)
      );
      await tx.mutate.bankAccount.insert({
        id: args.id,
        userId: ctx.userId,
        accountName: args.accountName,
        accountNumber: args.accountNumber,
        ifscCode: args.ifscCode,
        isDefault: existing.length === 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  ),
  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const account = await tx.run(zql.bankAccount.where("id", args.id).one());
      if (!account) {
        throw new Error("Bank account not found");
      }
      if (account.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }
      await tx.mutate.bankAccount.delete({ id: args.id });
      if (account.isDefault) {
        const next = await tx.run(
          zql.bankAccount
            .where("userId", ctx.userId)
            .orderBy("createdAt", "asc")
            .one()
        );
        if (next) {
          await tx.mutate.bankAccount.update({
            id: next.id,
            isDefault: true,
            updatedAt: Date.now(),
          });
        }
      }
    }
  ),
  setDefault: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const accounts = await tx.run(
        zql.bankAccount.where("userId", ctx.userId)
      );
      const target = accounts.find((a) => a.id === args.id);
      if (!target) {
        throw new Error("Bank account not found");
      }
      for (const acct of accounts) {
        await tx.mutate.bankAccount.update({
          id: acct.id,
          isDefault: acct.id === args.id,
          updatedAt: Date.now(),
        });
      }
    }
  ),
};
