import {
  type NotificationChannel,
  TOPIC_CATALOG,
  topicSupportsChannel,
} from "@pi-dash/notifications/topics";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

const REQUIRED_TOPIC_IDS: ReadonlySet<string> = new Set(
  TOPIC_CATALOG.filter((t) => t.required).map((t) => t.id)
);

const upsertSchema = z.object({
  channel: z.enum(["email", "whatsapp", "inbox"]),
  enabled: z.boolean(),
  topicId: z.string().min(1),
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
    inboxEnabled: channel === "inbox" ? enabled : true,
    whatsappEnabled: channel === "whatsapp" ? enabled : true,
  };
}

function assertTopicSupportsChannel(
  topicId: string,
  channel: NotificationChannel
) {
  if (!topicSupportsChannel(topicId, channel)) {
    throw new Error(`Topic "${topicId}" does not support ${channel}`);
  }
}

export const notificationPreferenceMutators = {
  adminUpsert: defineMutator(adminUpsertSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "users.edit");
    assertTopicSupportsChannel(args.topicId, args.channel);

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
        topicId: args.topicId,
        userId: args.userId,
        ...channelUpdate(args.channel, args.enabled),
      });
    } else {
      await tx.mutate.notificationTopicPreference.insert({
        topicId: args.topicId,
        userId: args.userId,
        ...channelDefaults(args.channel, args.enabled),
      });
    }
  }),
  upsert: defineMutator(upsertSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    assertTopicSupportsChannel(args.topicId, args.channel);

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
        topicId: args.topicId,
        userId,
        ...channelUpdate(args.channel, args.enabled),
      });
    } else {
      await tx.mutate.notificationTopicPreference.insert({
        topicId: args.topicId,
        userId,
        ...channelDefaults(args.channel, args.enabled),
      });
    }
  }),
};
