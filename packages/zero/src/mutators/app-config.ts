import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";

export const appConfigMutators = {
  upsert: defineMutator(
    z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.app_config");
      await tx.mutate.appConfig.upsert({
        key: args.key,
        value: args.value,
        updatedAt: Date.now(),
      });
    }
  ),
};
