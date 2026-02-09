import { env } from "@pi-dash/env/server";
import { getUserPhone, sendWhatsAppMessage } from "@pi-dash/whatsapp";
import { courier } from "./client";
import type { Topic } from "./topics";
import { TOPICS } from "./topics";

interface SendMessageOptions {
  body: string;
  clickAction?: string;
  emailBody?: string;
  idempotencyKey: string;
  title: string;
  to: string;
  topic?: Topic;
}

export async function sendMessage({
  to,
  title,
  body,
  emailBody,
  idempotencyKey,
  clickAction,
  topic = TOPICS.GENERAL,
}: SendMessageOptions): Promise<void> {
  const inboxPromise = courier.send.message(
    {
      message: {
        to: { user_id: to },
        content: { title, body },
        ...(clickAction && { data: { clickAction } }),
        routing: {
          method: "all",
          channels: ["inbox"],
        },
        preferences: {
          subscription_topic_id: topic,
        },
      },
    },
    { idempotencyKey: `${idempotencyKey}-inbox` }
  );

  const emailPromise = courier.send.message(
    {
      message: {
        to: { user_id: to },
        content: { title, body: emailBody ?? body },
        routing: {
          method: "all",
          channels: ["email"],
        },
        preferences: {
          subscription_topic_id: topic,
        },
      },
    },
    { idempotencyKey: `${idempotencyKey}-email` }
  );

  const whatsappPromise = (async () => {
    try {
      const phone = await getUserPhone(to);
      if (!phone) {
        return;
      }
      const appUrl = env.APP_URL;
      const whatsappBody =
        clickAction && appUrl
          ? `${body}\n\nView: ${appUrl}${clickAction}`
          : body;
      const footer = appUrl
        ? `\n\n_Sent by Proud Indian Dashboard_(${appUrl})`
        : "";
      await sendWhatsAppMessage(
        phone,
        `*${title}*\n\n${whatsappBody}${footer}`
      );
    } catch (error) {
      console.error("WhatsApp notification failed:", error);
    }
  })();

  await Promise.all([inboxPromise, emailPromise, whatsappPromise]);
}
