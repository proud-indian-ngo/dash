import { SOCIAL_MANAGE_CONFIG_KEYS } from "@pi-dash/shared/social-api";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";

const socialManageKeys = new Set(SOCIAL_MANAGE_CONFIG_KEYS);

/**
 * `settings.app_config` may write every key; `social.manage` may write only
 * the social settings keys shown on the Social page.
 */
export function assertCanWriteAppConfig(
  ctx: Context | undefined,
  key: string
): void {
  assertIsLoggedIn(ctx);
  if (can(ctx, "settings.app_config")) {
    return;
  }
  if (socialManageKeys.has(key) && can(ctx, "social.manage")) {
    return;
  }
  throw new Error("Unauthorized");
}

export const appConfigMutators = {
  /** Clear an optional key so readers fall back to their default. */
  remove: defineMutator(
    z.object({ key: z.string().min(1) }),
    async ({ tx, ctx, args }) => {
      assertCanWriteAppConfig(ctx, args.key);
      await tx.mutate.appConfig.delete({ key: args.key });
    }
  ),
  upsert: defineMutator(
    z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertCanWriteAppConfig(ctx, args.key);
      await tx.mutate.appConfig.upsert({
        key: args.key,
        updatedAt: Date.now(),
        value: args.value,
      });
    }
  ),
};
