import type { WebhookEventPayload } from "resend";
import { Webhook } from "standardwebhooks";

export type ResendWebhookEvent = WebhookEventPayload;

/**
 * Verifies a Resend webhook delivery (Svix-signed: `svix-id`,
 * `svix-timestamp`, `svix-signature`) against the raw body and returns the
 * event. Throws when the signature or timestamp doesn't check out.
 */
export function verifyResendWebhook(
  payload: string,
  headers: Headers,
  secret: string
): ResendWebhookEvent {
  return new Webhook(secret).verify(payload, {
    "webhook-id": headers.get("svix-id") ?? "",
    "webhook-signature": headers.get("svix-signature") ?? "",
    "webhook-timestamp": headers.get("svix-timestamp") ?? "",
  }) as ResendWebhookEvent;
}

export interface SuppressionFromEvent {
  email: string;
  reason: "complaint" | "hard_bounce";
  resendEmailId: string;
}

/**
 * The addresses an event says to stop emailing: every recipient of a
 * permanent bounce, or of an email reported as spam. Transient and
 * undetermined bounces, and every other event, suppress nothing.
 */
export function suppressionsFromEvent(
  event: ResendWebhookEvent
): SuppressionFromEvent[] {
  if (
    event.type === "email.bounced" &&
    event.data.bounce.type === "Permanent"
  ) {
    return event.data.to.map((email) => ({
      email,
      reason: "hard_bounce",
      resendEmailId: event.data.email_id,
    }));
  }
  if (event.type === "email.complained") {
    return event.data.to.map((email) => ({
      email,
      reason: "complaint",
      resendEmailId: event.data.email_id,
    }));
  }
  return [];
}
