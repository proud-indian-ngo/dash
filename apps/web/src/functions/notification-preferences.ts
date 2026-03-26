import type { PermissionId } from "@pi-dash/db/permissions";
import {
  getAllUserPreferences,
  TOPIC_CATALOG,
  updateUserTopicPreference,
} from "@pi-dash/notifications";
import {
  getWhatsAppNotifications,
  setWhatsAppNotifications,
} from "@pi-dash/whatsapp";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import z from "zod";
import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

const adminUserIdSchema = z.object({
  userId: z.string().min(1),
});

export interface TopicPreference {
  description: string;
  enabled: boolean;
  group: string;
  required: boolean;
  requiredPermission?: PermissionId;
  topicId: string;
  topicName: string;
}

function mapToTopicPreferences(
  courierItems: Awaited<ReturnType<typeof getAllUserPreferences>>
): TopicPreference[] {
  const courierMap = new Map(courierItems.map((item) => [item.topic_id, item]));

  return TOPIC_CATALOG.map((meta) => {
    const courier = courierMap.get(meta.id);
    return {
      topicId: meta.id,
      topicName: meta.name,
      description: meta.description,
      group: meta.group,
      enabled: courier ? courier.status !== "OPTED_OUT" : meta.defaultEnabled,
      required: meta.required,
      requiredPermission: meta.requiredPermission,
    };
  });
}

export const getNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }

    const userId = context.session.user.id;

    try {
      const items = await getAllUserPreferences(userId);
      return mapToTopicPreferences(items);
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "getNotificationPreferences",
        userId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "fetch-courier-preferences",
      });
      log.emit();
      return [];
    }
  });

const updatePreferenceSchema = z.object({
  topicId: z.string().min(1),
  enabled: z.boolean(),
});

export const updateNotificationPreference = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updatePreferenceSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }

    const userId = context.session.user.id;

    try {
      await updateUserTopicPreference({
        userId,
        topicId: data.topicId,
        status: data.enabled ? "OPTED_IN" : "OPTED_OUT",
      });

      return { success: true };
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "updateNotificationPreference",
        userId,
        topicId: data.topicId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "update-courier-preference",
      });
      log.emit();
      throw new Error("Failed to update notification preference");
    }
  });

export const getWhatsAppNotificationPref = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }

    return await getWhatsAppNotifications(context.session.user.id);
  });

const whatsappNotificationSchema = z.object({
  enabled: z.boolean(),
});

export const updateWhatsAppNotificationPref = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .inputValidator(whatsappNotificationSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }

    try {
      await setWhatsAppNotifications(context.session.user.id, data.enabled);

      return { success: true };
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "updateWhatsAppNotificationPref",
        userId: context.session.user.id,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "update-whatsapp-preference",
      });
      log.emit();
      throw new Error("Failed to update WhatsApp preference");
    }
  });

// --- Admin functions ---

export const getNotificationPreferencesAdmin = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .inputValidator(adminUserIdSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "users.edit");

    try {
      const items = await getAllUserPreferences(data.userId);
      return mapToTopicPreferences(items);
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "getNotificationPreferencesAdmin",
        userId: data.userId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "fetch-courier-preferences",
      });
      log.emit();
      throw new Error("Failed to fetch notification preferences");
    }
  });

const adminUpdatePreferenceSchema = z.object({
  userId: z.string().min(1),
  topicId: z.string().min(1),
  enabled: z.boolean(),
});

export const updateNotificationPreferenceAdmin = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .inputValidator(adminUpdatePreferenceSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "users.edit");

    try {
      await updateUserTopicPreference({
        userId: data.userId,
        topicId: data.topicId,
        status: data.enabled ? "OPTED_IN" : "OPTED_OUT",
      });

      return { success: true };
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "updateNotificationPreferenceAdmin",
        userId: data.userId,
        topicId: data.topicId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "update-courier-preference",
      });
      log.emit();
      throw new Error("Failed to update notification preference");
    }
  });

const adminWhatsAppSchema = z.object({
  userId: z.string().min(1),
  enabled: z.boolean(),
});

export const getWhatsAppNotificationPrefAdmin = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .inputValidator(adminUserIdSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "users.edit");

    return await getWhatsAppNotifications(data.userId);
  });

export const updateWhatsAppNotificationPrefAdmin = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .inputValidator(adminWhatsAppSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "users.edit");

    try {
      await setWhatsAppNotifications(data.userId, data.enabled);

      return { success: true };
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "updateWhatsAppNotificationPrefAdmin",
        userId: data.userId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "update-whatsapp-preference",
      });
      log.emit();
      throw new Error("Failed to update WhatsApp preference");
    }
  });
