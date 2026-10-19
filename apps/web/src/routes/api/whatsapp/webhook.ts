import { createHmac, timingSafeEqual } from "node:crypto";

import { recordGowaReceipt } from "@pi-dash/db/queries/gowa-message";
import { env } from "@pi-dash/env/server";
import { receiptFromAck } from "@pi-dash/whatsapp/ack";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { readRequestBody } from "@/lib/read-request-body";
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

        const body = await readRequestBody(request);
        if (!body.ok) {
          log.warn(`whatsapp_webhook_body_${body.reason}`);
          log.emit();
          return Response.json(
            {
              error:
                body.reason === "too_large"
                  ? "Body too large"
                  : "Failed to read webhook body",
            },
            { status: body.reason === "too_large" ? 413 : 408 }
          );
        }
        const rawBody = body.text;

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

        // Every member's receipt is a call, so this is one upsert and no
        // lookups; the delivery page matches people to users when it reads.
        const receipt = receiptFromAck(parsedBody);
        if (receipt) {
          try {
            await recordGowaReceipt(receipt);
            log.set({
              messageCount: receipt.messageIds.length,
              outcome: "receipt_recorded",
              receiptType: receipt.type,
            });
            log.emit();
            return Response.json({ ok: true }, { status: 200 });
          } catch (error) {
            log.error(error instanceof Error ? error : String(error));
            log.emit();
            return Response.json(
              { error: "Failed to record receipt" },
              { status: 500 }
            );
          }
        }

        const result = whatsAppPollVoteWebhookSchema.safeParse(parsedBody);
        if (!result.success) {
          log.set({ outcome: "ignored", reason: "not_a_decrypted_poll_vote" });
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        }

        try {
          const outcome = await processWhatsAppPollVoteWebhook(result.data);
          log.set({
            outcome,
            pollMessageId: result.data.payload.poll.poll_id,
          });
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        } catch (error) {
          log.set({ pollMessageId: result.data.payload.poll.poll_id });
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
