import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import {
  processWhatsAppPollVoteWebhook,
  whatsAppPollVoteWebhookSchema,
} from "@/lib/whatsapp-rsvp";

function isValidSignature(rawBody: string, signature: string): boolean {
  const expected = `sha256=${createHmac("sha256", env.WHATSAPP_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const log = createRequestLogger({
          method: "POST",
          path: "/api/whatsapp/webhook",
        });

        const signature = request.headers.get("x-hub-signature-256");
        log.set({ hasSignature: !!signature });

        let rawBody: string;
        try {
          rawBody = await Promise.race([
            request.text(),
            new Promise<string>((_, reject) => {
              setTimeout(() => {
                reject(new Error("whatsapp_webhook_body_timeout"));
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

        if (!(signature && isValidSignature(rawBody, signature))) {
          log.warn("invalid_webhook_signature");
          log.emit();
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(rawBody);
        } catch (error) {
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const result = whatsAppPollVoteWebhookSchema.safeParse(parsedBody);
        if (!result.success) {
          log.set({ issues: result.error.issues });
          log.warn("unsupported_whatsapp_webhook_payload");
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        }

        try {
          const outcome = await processWhatsAppPollVoteWebhook(result.data);
          log.set({
            outcome,
            pollMessageId: result.data.payload.poll_message_id,
          });
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        } catch (error) {
          log.set({ pollMessageId: result.data.payload.poll_message_id });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json(
            { error: "Failed to process webhook" },
            { status: 500 }
          );
        }
      },
    },
  },
});
