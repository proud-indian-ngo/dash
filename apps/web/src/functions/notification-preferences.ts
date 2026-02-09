import {
  getAllUserPreferences,
  updateUserTopicPreference,
} from "@pi-dash/notifications";
import {
  getWhatsAppNotifications,
  setWhatsAppNotifications,
} from "@pi-dash/whatsapp";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { authMiddleware } from "@/middleware/auth";

export interface TopicPreference {
  enabled: boolean;
  required: boolean;
  topicId: string;
  topicName: string;
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
      return items.map(
        (item): TopicPreference => ({
          topicId: item.topic_id,
          topicName: item.topic_name,
          enabled: item.status !== "OPTED_OUT",
          required: item.default_status === "REQUIRED",
        })
      );
    } catch (error) {
      console.error("Failed to fetch Courier preferences:", error);
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

    await updateUserTopicPreference({
      userId,
      topicId: data.topicId,
      status: data.enabled ? "OPTED_IN" : "OPTED_OUT",
    });

    return { success: true };
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

    await setWhatsAppNotifications(context.session.user.id, data.enabled);

    return { success: true };
  });
