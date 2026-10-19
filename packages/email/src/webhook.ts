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

/**
 * Tags every notification email, so the webhook can tell them from auth and
 * receipt email, which aren't logged, even when an event beats the log's
 * insert.
 */
export const NOTIFICATION_EMAIL_TAG = {
  name: "category",
  value: "notification",
} as const;

export type EmailLogStatus =
  | "sent"
  | "delayed"
  | "delivered"
  | "complained"
  | "bounced"
  | "failed"
  | "suppressed";

export interface EmailLogUpdate {
  error: string | null;
  resendEmailId: string;
  status: EmailLogStatus;
}

interface LoggedEvent {
  data: { email_id: string; tags?: Record<string, string> };
  error: string | null;
  status: EmailLogStatus;
}

function loggedEvent(event: ResendWebhookEvent): LoggedEvent | null {
  switch (event.type) {
    case "email.sent":
      return { data: event.data, error: null, status: "sent" };
    case "email.delivered":
      return { data: event.data, error: null, status: "delivered" };
    case "email.delivery_delayed":
      return { data: event.data, error: null, status: "delayed" };
    case "email.complained":
      return { data: event.data, error: null, status: "complained" };
    case "email.bounced": {
      const { bounce } = event.data;
      return {
        data: event.data,
        error: `${bounce.type} (${bounce.subType}): ${bounce.message}`,
        status: "bounced",
      };
    }
    case "email.failed":
      return {
        data: event.data,
        error: event.data.failed.reason,
        status: "failed",
      };
    case "email.suppressed":
      return {
        data: event.data,
        error: event.data.suppressed.message,
        status: "suppressed",
      };
    default:
      return null;
  }
}

/**
 * The delivery-log update an event carries, or null for events the log
 * ignores (opens, clicks) and email without the notification tag.
 */
export function emailLogUpdateFromEvent(
  event: ResendWebhookEvent
): EmailLogUpdate | null {
  const logged = loggedEvent(event);
  if (
    logged?.data.tags?.[NOTIFICATION_EMAIL_TAG.name] !==
    NOTIFICATION_EMAIL_TAG.value
  ) {
    return null;
  }
  return {
    error: logged.error,
    resendEmailId: logged.data.email_id,
    status: logged.status,
  };
}
