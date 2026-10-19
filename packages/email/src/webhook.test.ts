import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";

import {
  emailLogUpdateFromEvent,
  NOTIFICATION_EMAIL_TAG,
  type ResendWebhookEvent,
  suppressionsFromEvent,
  verifyResendWebhook,
} from "./webhook";

const SECRET = `whsec_${Buffer.from("test-secret-test-secret-32-bytes").toString("base64")}`;

function bounced(type: string): ResendWebhookEvent {
  return {
    created_at: "2026-10-14T00:00:00.000Z",
    data: {
      bounce: { message: "Mailbox does not exist", subType: "General", type },
      created_at: "2026-10-14T00:00:00.000Z",
      email_id: "email-1",
      from: "noreply@example.com",
      message_id: "msg-1",
      subject: "Hello",
      to: ["gone@example.com"],
    },
    type: "email.bounced",
  };
}

function signedHeaders(payload: string, secret = SECRET): Headers {
  const id = "msg_1";
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  return new Headers({
    "svix-id": id,
    "svix-signature": signature,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
  });
}

describe("verifyResendWebhook", () => {
  it("returns the event for a correctly signed body", () => {
    const payload = JSON.stringify(bounced("Permanent"));

    const event = verifyResendWebhook(payload, signedHeaders(payload), SECRET);

    expect(event.type).toBe("email.bounced");
  });

  it("throws for a body signed with another secret", () => {
    const payload = JSON.stringify(bounced("Permanent"));
    const other = `whsec_${Buffer.from("another-secret-another-secret-32").toString("base64")}`;

    expect(() =>
      verifyResendWebhook(payload, signedHeaders(payload, other), SECRET)
    ).toThrow();
  });

  it("throws for a tampered body", () => {
    const payload = JSON.stringify(bounced("Permanent"));
    const headers = signedHeaders(payload);

    expect(() =>
      verifyResendWebhook(payload.replace("gone", "kept"), headers, SECRET)
    ).toThrow();
  });

  it("throws without signature headers", () => {
    expect(() => verifyResendWebhook("{}", new Headers(), SECRET)).toThrow();
  });
});

describe("suppressionsFromEvent", () => {
  it("suppresses recipients of a permanent bounce", () => {
    expect(suppressionsFromEvent(bounced("Permanent"))).toEqual([
      {
        email: "gone@example.com",
        reason: "hard_bounce",
        resendEmailId: "email-1",
      },
    ]);
  });

  it("ignores transient and undetermined bounces", () => {
    expect(suppressionsFromEvent(bounced("Transient"))).toEqual([]);
    expect(suppressionsFromEvent(bounced("Undetermined"))).toEqual([]);
  });

  it("suppresses recipients who reported spam", () => {
    const event = bounced("Permanent");
    const complained = {
      created_at: event.created_at,
      data: { ...event.data, to: ["annoyed@example.com"] },
      type: "email.complained",
    } as ResendWebhookEvent;

    expect(suppressionsFromEvent(complained)).toEqual([
      {
        email: "annoyed@example.com",
        reason: "complaint",
        resendEmailId: "email-1",
      },
    ]);
  });

  it("ignores delivery events", () => {
    const event = bounced("Permanent");
    expect(
      suppressionsFromEvent({
        ...event,
        type: "email.delivered",
      } as ResendWebhookEvent)
    ).toEqual([]);
  });
});

describe("emailLogUpdateFromEvent", () => {
  const tags = { [NOTIFICATION_EMAIL_TAG.name]: NOTIFICATION_EMAIL_TAG.value };
  const base = {
    created_at: "2026-10-19T00:00:00.000Z",
    email_id: "email-1",
    from: "noreply@example.com",
    message_id: "msg-1",
    subject: "Hello",
    tags,
    to: ["a@example.com"],
  };
  const event = (type: string, extra: object = {}) =>
    ({
      created_at: "2026-10-19T00:00:00.000Z",
      data: { ...base, ...extra },
      type,
    }) as ResendWebhookEvent;

  it.each([
    ["email.sent", "sent"],
    ["email.delivered", "delivered"],
    ["email.delivery_delayed", "delayed"],
    ["email.complained", "complained"],
  ])("maps %s to %s", (type, status) => {
    expect(emailLogUpdateFromEvent(event(type))).toEqual({
      error: null,
      resendEmailId: "email-1",
      status,
    });
  });

  it("keeps the reason for bounces, failures and suppressions", () => {
    expect(
      emailLogUpdateFromEvent(
        event("email.bounced", {
          bounce: {
            message: "No mailbox",
            subType: "General",
            type: "Permanent",
          },
        })
      )
    ).toMatchObject({
      error: "Permanent (General): No mailbox",
      status: "bounced",
    });
    expect(
      emailLogUpdateFromEvent(
        event("email.failed", { failed: { reason: "Quota exceeded" } })
      )
    ).toMatchObject({ error: "Quota exceeded", status: "failed" });
    expect(
      emailLogUpdateFromEvent(
        event("email.suppressed", {
          suppressed: {
            message: "On the suppression list",
            type: "OnAccountSuppressionList",
          },
        })
      )
    ).toMatchObject({ error: "On the suppression list", status: "suppressed" });
  });

  it("ignores opens and clicks", () => {
    expect(emailLogUpdateFromEvent(event("email.opened"))).toBeNull();
  });

  it("ignores email without the notification tag", () => {
    expect(
      emailLogUpdateFromEvent(event("email.delivered", { tags: undefined }))
    ).toBeNull();
    expect(
      emailLogUpdateFromEvent(
        event("email.delivered", { tags: { category: "auth" } })
      )
    ).toBeNull();
  });
});
