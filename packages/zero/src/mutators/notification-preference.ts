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
  channel: z.enum(["email", "whatsapp"]),
  enabled: z.boolean(),
});

const adminUpsertSchema = upsertSchema.extend({
  userId: z.string().min(1),
});

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
        ...(args.channel === "email"
          ? { emailEnabled: args.enabled }
          : { whatsappEnabled: args.enabled }),
      });
    } else {
      await tx.mutate.notificationTopicPreference.insert({
        userId,
        topicId: args.topicId,
        emailEnabled: args.channel === "email" ? args.enabled : true,
        whatsappEnabled: args.channel === "whatsapp" ? args.enabled : true,
      });
    }

    if (tx.location === "server" && args.channel === "email") {
      const previousEmailEnabled = existing?.emailEnabled ?? true;
      ctx.asyncTasks?.push({
        meta: {
          mutator: "notificationPreference.upsert",
          userId,
          topicId: args.topicId,
          enabled: args.enabled,
        },
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue("sync-courier-preference", {
            userId,
            topicId: args.topicId,
            enabled: args.enabled,
            previousEmailEnabled,
          });
        },
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
        ...(args.channel === "email"
          ? { emailEnabled: args.enabled }
          : { whatsappEnabled: args.enabled }),
      });
    } else {
      await tx.mutate.notificationTopicPreference.insert({
        userId: args.userId,
        topicId: args.topicId,
        emailEnabled: args.channel === "email" ? args.enabled : true,
        whatsappEnabled: args.channel === "whatsapp" ? args.enabled : true,
      });
    }

    if (tx.location === "server" && args.channel === "email") {
      const previousEmailEnabled = existing?.emailEnabled ?? true;
      ctx.asyncTasks?.push({
        meta: {
          mutator: "notificationPreference.adminUpsert",
          userId: args.userId,
          topicId: args.topicId,
          enabled: args.enabled,
        },
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue("sync-courier-preference", {
            userId: args.userId,
            topicId: args.topicId,
            enabled: args.enabled,
            previousEmailEnabled,
          });
        },
      });
    }
  }),
};
