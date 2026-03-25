import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  getAllUserPreferences,
  updateUserTopicPreference,
} from "@pi-dash/notifications";
import {
  getWhatsAppNotifications,
  setWhatsAppNotifications,
} from "@pi-dash/whatsapp";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import z from "zod";
import { authMiddleware } from "@/middleware/auth";

const adminUserIdSchema = z.object({
  userId: z.string().min(1),
});

export interface TopicPreference {
  enabled: boolean;
  required: boolean;
  topicId: string;
  topicName: string;
}

function mapToTopicPreferences(
  items: Awaited<ReturnType<typeof getAllUserPreferences>>
): TopicPreference[] {
  return items.map((item) => ({
    topicId: item.topic_id,
    topicName: item.topic_name,
    enabled: item.status !== "OPTED_OUT",
    required: item.default_status === "REQUIRED",
  }));
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
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const role = context.session.user.role ?? "volunteer";
    const permissions = await resolvePermissions(role);
    if (!permissions.includes("users.edit")) {
      throw new Error("Forbidden");
    }

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
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const role = context.session.user.role ?? "volunteer";
    const permissions = await resolvePermissions(role);
    if (!permissions.includes("users.edit")) {
      throw new Error("Forbidden");
    }

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
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const role = context.session.user.role ?? "volunteer";
    const permissions = await resolvePermissions(role);
    if (!permissions.includes("users.edit")) {
      throw new Error("Forbidden");
    }

    return await getWhatsAppNotifications(data.userId);
  });

export const updateWhatsAppNotificationPrefAdmin = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .inputValidator(adminWhatsAppSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const role = context.session.user.role ?? "volunteer";
    const permissions = await resolvePermissions(role);
    if (!permissions.includes("users.edit")) {
      throw new Error("Forbidden");
    }

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
