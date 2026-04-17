import { TOPIC_CATALOG } from "@pi-dash/notifications/topics";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

const REQUIRED_TOPIC_IDS: ReadonlySet<string> = new Set(
  TOPIC_CATALOG.filter((t) => t.required).map((t) => t.id)
);

const upsertSchema = z.object({
  topicId: z.string().min(1),
  channel: z.enum(["email", "whatsapp", "inbox"]),
  enabled: z.boolean(),
});

const adminUpsertSchema = upsertSchema.extend({
  userId: z.string().min(1),
});

function channelUpdate(channel: string, enabled: boolean) {
  if (channel === "email") {
    return { emailEnabled: enabled };
  }
  if (channel === "whatsapp") {
    return { whatsappEnabled: enabled };
  }
  return { inboxEnabled: enabled };
}

function channelDefaults(channel: string, enabled: boolean) {
  return {
    emailEnabled: channel === "email" ? enabled : true,
    whatsappEnabled: channel === "whatsapp" ? enabled : true,
    inboxEnabled: channel === "inbox" ? enabled : true,
  };
}

export const notificationPreferenceMutators = {
  upsert: defineMutator(upsertSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;

    if (!args.enabled && REQUIRED_TOPIC_IDS.has(args.topicId)) {
      throw new Error(
        `Topic "${args.topicId}" is required and cannot be disabled`
      );
    }

    const existing = await tx.run(
      zql.notificationTopicPreference
        .where("userId", userId)
        .where("topicId", args.topicId)
        .one()
    );

    if (existing) {
      await tx.mutate.notificationTopicPreference.update({
        userId,
        topicId: args.topicId,
        ...channelUpdate(args.channel, args.enabled),
      });
    } else {
      await tx.mutate.notificationTopicPreference.insert({
        userId,
        topicId: args.topicId,
        ...channelDefaults(args.channel, args.enabled),
      });
    }
  }),

  adminUpsert: defineMutator(adminUpsertSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "users.edit");

    if (!args.enabled && REQUIRED_TOPIC_IDS.has(args.topicId)) {
      throw new Error(
        `Topic "${args.topicId}" is required and cannot be disabled`
      );
    }

    const existing = await tx.run(
      zql.notificationTopicPreference
        .where("userId", args.userId)
        .where("topicId", args.topicId)
        .one()
    );

    if (existing) {
      await tx.mutate.notificationTopicPreference.update({
        userId: args.userId,
        topicId: args.topicId,
        ...channelUpdate(args.channel, args.enabled),
      });
    } else {
      await tx.mutate.notificationTopicPreference.insert({
        userId: args.userId,
        topicId: args.topicId,
        ...channelDefaults(args.channel, args.enabled),
      });
    }
  }),
};
