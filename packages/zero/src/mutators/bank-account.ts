import {
  findDuplicatePayout,
  normalizePayoutAccount,
  payoutAccountFields,
  refinePayoutAccount,
} from "@pi-dash/shared/payout-account";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

/** Bank details (number and IFSC), a UPI ID or number, or both. */
export const createBankAccountArgs = z
  .object({ ...payoutAccountFields, id: z.string() })
  .superRefine(refinePayoutAccount);

export const bankAccountMutators = {
  create: defineMutator(createBankAccountArgs, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const account = normalizePayoutAccount(args);
    const existing = await tx.run(zql.bankAccount.where("userId", ctx.userId));
    const duplicate = findDuplicatePayout(existing, account);
    if (duplicate) {
      throw new Error(duplicate.message);
    }
    await tx.mutate.bankAccount.insert({
      ...account,
      createdAt: Date.now(),
      id: args.id,
      isDefault: existing.length === 0,
      updatedAt: Date.now(),
      userId: ctx.userId,
    });
  }),
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
      // Unset old default(s) first to avoid unique constraint violation
      await Promise.all(
        accounts.map(async (acct) => {
          if (acct.isDefault && acct.id !== args.id) {
            await tx.mutate.bankAccount.update({
              id: acct.id,
              isDefault: false,
              updatedAt: Date.now(),
            });
          }
        })
      );
      // Then set the new default
      if (!target.isDefault) {
        await tx.mutate.bankAccount.update({
          id: args.id,
          isDefault: true,
          updatedAt: Date.now(),
        });
      }
    }
  ),
};
