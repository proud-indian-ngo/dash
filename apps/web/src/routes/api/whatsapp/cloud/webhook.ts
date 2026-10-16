import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";

import {
  handleCloudWebhookPost,
  verifySubscription,
} from "@/lib/whatsapp-cloud-webhook";

/**
 * Meta's WhatsApp Cloud API webhook: delivery statuses for sent messages,
 * and messages people send to the notification number (answered with an
 * auto-reply). Unset WHATSAPP_CLOUD_APP_SECRET disables it; changes for
 * numbers other than WHATSAPP_CLOUD_PHONE_NUMBER_ID are ignored.
 */
export const Route = createFileRoute("/api/whatsapp/cloud/webhook")({
  server: {
    handlers: {
      GET: ({ request }) =>
        verifySubscription(
          new URL(request.url),
          env.WHATSAPP_CLOUD_VERIFY_TOKEN
        ),
      POST: ({ request }) =>
        handleCloudWebhookPost(request, {
          appSecret: env.WHATSAPP_CLOUD_APP_SECRET,
          phoneNumberId: env.WHATSAPP_CLOUD_PHONE_NUMBER_ID,
        }),
    },
  },
});
