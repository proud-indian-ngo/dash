import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";

import {
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
