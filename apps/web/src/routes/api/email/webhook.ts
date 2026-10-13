import { recordEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import {
  suppressionsFromEvent,
  verifyResendWebhook,
} from "@pi-dash/email/webhook";
import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

/**
 * Resend delivery events. Permanent bounces and spam complaints add the
 * recipient to the suppression list, so notification email stops going to
 * them. Unauthenticated and signed by Resend (Svix), so outside the audit
 * ledger like the WhatsApp webhook.
 */
export const Route = createFileRoute("/api/email/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const log = createRequestLogger({
          method: "POST",
          path: "/api/email/webhook",
        });

        const secret = env.RESEND_WEBHOOK_SECRET;
        if (!secret) {
          log.warn("email_webhook_not_configured");
          log.emit();
          return Response.json(
            { error: "Webhook not configured" },
            { status: 503 }
          );
        }

        let rawBody: string;
        try {
          rawBody = await Promise.race([
            request.text(),
            new Promise<string>((_, reject) => {
              setTimeout(() => {
                reject(new Error("email_webhook_body_timeout"));
              }, 3000);
            }),
          ]);
        } catch (error) {
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json(
            { error: "Failed to read webhook body" },
            { status: 408 }
          );
        }

        let event: ReturnType<typeof verifyResendWebhook>;
        try {
          event = verifyResendWebhook(rawBody, request.headers, secret);
        } catch {
          log.warn("invalid_webhook_signature");
          log.emit();
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        const suppressions = suppressionsFromEvent(event);
        log.set({ eventType: event.type, suppressions: suppressions.length });
        try {
          for (const suppression of suppressions) {
            await recordEmailSuppression(suppression);
          }
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        } catch (error) {
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          // Non-2xx makes Resend retry the delivery.
          return Response.json(
            { error: "Failed to process webhook" },
            { status: 500 }
          );
        }
      },
    },
  },
});
