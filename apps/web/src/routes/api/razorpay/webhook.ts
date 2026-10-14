import { writeRazorpayConfig } from "@pi-dash/db/queries/razorpay-import";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { razorpaySetup } from "@/lib/razorpay/config";
import { stageRazorpayPayment } from "@/lib/razorpay/ingest";
import {
  readWebhookBody,
  routeRazorpayEvent,
  verifyRazorpaySignature,
} from "@/lib/razorpay/webhook";
import { databaseErrorFields, sanitizedError } from "@/lib/safe-errors";

const BODY_TIMEOUT_MS = 3000;
/** A body the route could not read: a client abort is the client's fault, not ours. */
const BODY_ERRORS = {
  aborted: { message: "Failed to read webhook body", status: 400 },
  timeout: { message: "Failed to read webhook body", status: 408 },
  too_large: { message: "Body too large", status: 413 },
} as const;

/**
 * Razorpay webhook: the trigger for recording Payment Page donations. A
 * verified `payment.captured` or `order.paid` stages the payment in
 * `private.import_row` and enqueues `razorpay-sync-payment` keyed by the
 * payment ID; the job does the import. One whose payment cannot be read is
 * fetched by ID when the API key secret is set. Bodies over 1 MB are
 * refused with 413, a stalled body with 408 and an aborted one with 400. A test key on a production server records nothing.
 * Webhooks are outside the audit ledger; logs carry the event, its ID and
 * the payment ID only.
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

        const body = await readWebhookBody(request, {
          timeoutMs: BODY_TIMEOUT_MS,
        });
        if (!body.ok) {
          log.warn(`razorpay_webhook_body_${body.reason}`);
          log.emit();
          return Response.json(
            { error: BODY_ERRORS[body.reason].message },
            { status: BODY_ERRORS[body.reason].status }
          );
        }
        const rawBody = body.text;

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

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
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
          log.set({ lastWebhookAtSaved: false, ...databaseErrorFields(error) });
          log.error(sanitizedError(error, "razorpay_last_webhook_at"));
        }

        const action = routeRazorpayEvent(parsed, setup.apiKey !== null);
        if (setup.testInProduction) {
          // A test key in production would put test payments in the real
          // books: acknowledged so Razorpay stops retrying, never recorded.
          log.set({
            event: action.event,
            outcome: "test_mode_refused",
            paymentId:
              action.action === "stage" ? action.payment.id : action.paymentId,
          });
          log.warn("test mode refused");
          log.emit();
          return Response.json({ ok: true }, { status: 200 });
        }
        if (action.action === "fetch") {
          log.set({ event: action.event, paymentId: action.paymentId });
          try {
            const jobId = await enqueue(
              "razorpay-sync-payment",
              { paymentId: action.paymentId },
              { singletonKey: action.paymentId }
            );
            log.set({ outcome: "fetch_queued", queued: jobId !== null });
            log.emit();
            return Response.json({ ok: true }, { status: 200 });
          } catch (error) {
            log.error(sanitizedError(error, "razorpay_enqueue_failed"));
            log.emit();
            return Response.json(
              { error: "Failed to record the payment" },
              { status: 500 }
            );
          }
        }
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
          log.set(databaseErrorFields(error));
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
