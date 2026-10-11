import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";

export const appConfigMutators = {
  /** Clear an optional key so readers fall back to their default. */
  remove: defineMutator(
    z.object({ key: z.string().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.app_config");
      await tx.mutate.appConfig.delete({ key: args.key });
    }
  ),
  upsert: defineMutator(
    z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "settings.app_config");
      await tx.mutate.appConfig.upsert({
        key: args.key,
        updatedAt: Date.now(),
        value: args.value,
      });
    }
  ),
};
