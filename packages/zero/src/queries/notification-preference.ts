import { defineQuery } from "@rocicorp/zero";
import z from "zod";
import { can } from "../permissions";
import { zql } from "../schema";

export const notificationPreferenceQueries = {
  byCurrentUser: defineQuery(({ ctx }) =>
    zql.notificationTopicPreference.where("userId", ctx?.userId)
  ),
  byUser: defineQuery(
    z.object({ userId: z.string() }),
    ({ args: { userId }, ctx }) =>
      ctx != null && can(ctx, "users.edit")
        ? zql.notificationTopicPreference.where("userId", userId)
        : zql.notificationTopicPreference.where("userId", ctx?.userId)
  ),
};
