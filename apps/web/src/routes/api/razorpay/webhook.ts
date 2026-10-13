import { writeRazorpayConfig } from "@pi-dash/db/queries/razorpay-import";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { razorpaySetup } from "@/lib/razorpay/config";
import { stageRazorpayPayment } from "@/lib/razorpay/ingest";
import { sanitizedError } from "@/lib/razorpay/safe-error";
import {
  routeRazorpayEvent,
  verifyRazorpaySignature,
} from "@/lib/razorpay/webhook";

const BODY_TIMEOUT_MS = 3000;

/**
 * Razorpay webhook: the trigger for recording Payment Page donations. A
 * verified `payment.captured` or `order.paid` stages the payment in
 * `private.import_row` and enqueues `razorpay-sync-payment` keyed by the
 * payment ID; the job does the import. Webhooks are outside the audit
 * ledger; logs carry the event, its ID and the payment ID only.
 */
export const Route = createFileRoute("/api/razorpay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const log = createRequestLogger({
          method: "POST",
          path: "/api/razorpay/webhook",
        });
        const setup = razorpaySetup();
        if (!setup.enabled) {
          log.set({ outcome: "not_configured" });
          log.emit();
          return Response.json(
            { error: "Razorpay is not configured" },
            { status: 404 }
          );
        }

        let rawBody: string;
        try {
          rawBody = await Promise.race([
            request.text(),
            new Promise<string>((_, reject) => {
              setTimeout(() => {
                reject(new Error("razorpay_webhook_body_timeout"));
              }, BODY_TIMEOUT_MS);
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

        const signature = request.headers.get("x-razorpay-signature");
        log.set({
          eventId: request.headers.get("x-razorpay-event-id"),
          hasSignature: Boolean(signature),
        });
        if (!verifyRazorpaySignature(rawBody, signature, setup.webhookSecret)) {
          log.warn("invalid_webhook_signature");
          log.emit();
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          log.warn("invalid_webhook_json");
          log.emit();
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        try {
          await writeRazorpayConfig({
            lastWebhookAt: new Date().toISOString(),
          });
        } catch (error) {
          // Only the settings page's "last received" reads this; carry on.
          log.set({ lastWebhookAtSaved: false });
          log.error(sanitizedError(error, "razorpay_last_webhook_at"));
        }

        const action = routeRazorpayEvent(body);
        if (action.action === "ignore") {
          log.set({
            event: action.event,
            outcome: action.reason,
            paymentId: action.paymentId,
          });
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        }

        const paymentId = action.payment.id;
        log.set({ event: action.event, paymentId });
        try {
          const staged = await stageRazorpayPayment(action.payment, setup.mode);
          const jobId = await enqueue(
            "razorpay-sync-payment",
            { day: staged.day, paymentId },
            { singletonKey: paymentId }
          );
          log.set({ outcome: staged.staged, queued: jobId !== null });
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        } catch (error) {
          // A 5xx makes Razorpay retry; staging and the job are idempotent.
          log.error(sanitizedError(error, "razorpay_stage_failed"));
          log.emit();
          return Response.json(
            { error: "Failed to record the payment" },
            { status: 500 }
          );
        }
      },
    },
  },
});
