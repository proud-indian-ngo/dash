import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  sendEmailBatch: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/env/server", () => ({
  env: {
    APP_URL: "https://dash.test",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-32",
  },
}));
vi.mock("@pi-dash/email", () => ({
  FOOTER_NOTE_PLACEHOLDER: "%%NOTE%%",
}));
vi.mock("@pi-dash/email/mailer", () => ({
  EmailSendError: class extends Error {},
  sendEmail: mocks.sendEmail,
  sendEmailBatch: mocks.sendEmailBatch,
}));

import { buildNotificationEmail, sendBulkNotificationEmails } from "./email";
import { TOPICS } from "./topics";

const html = "<p>Hello</p><p>%%NOTE%%<a>Notification settings</a></p>";

describe("buildNotificationEmail", () => {
  it("adds the topic, unsubscribe link and one-click headers for optional topics", () => {
    const message = buildNotificationEmail({
      body: "b",
      emailHtml: html,
      title: "👥 Added to team",
      toEmail: "a@test.com",
      topic: TOPICS.TEAMS,
      userId: "user-1",
    });

    expect(message.subject).toBe("Added to team");
    expect(message.html).toContain("subscribed to <b>Teams · ");
    expect(message.html).toContain("https://dash.test/unsubscribe?");
    expect(message.html).not.toContain("%%NOTE%%");
    expect(message.headers?.["List-Unsubscribe"]).toMatch(
      /^<https:\/\/dash\.test\/api\/email\/unsubscribe\?.+>$/
    );
    expect(message.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
  });

  it("leaves required topics without an unsubscribe link or headers", () => {
    const message = buildNotificationEmail({
      body: "b",
      emailHtml: html,
      title: "Role changed",
      toEmail: "a@test.com",
      topic: TOPICS.ACCOUNT,
      userId: "user-1",
    });

    expect(message.headers).toBeUndefined();
    expect(message.html).toBe(
      "<p>Hello</p><p><a>Notification settings</a></p>"
    );
  });

  it("escapes the plain-body fallback", () => {
    const message = buildNotificationEmail({
      body: "<script>x</script>",
      title: "t",
      toEmail: "a@test.com",
    });

    expect(message.html).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
  });
});

describe("sendBulkNotificationEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sorts recipients so retried jobs build the same chunks", async () => {
    mocks.sendEmailBatch.mockResolvedValueOnce({
      failures: [],
      sent: 2,
      skipped: false,
    });

    const sent = await sendBulkNotificationEmails({
      body: "b",
      emailHtml: html,
      idempotencyKey: "bulk-email",
      recipients: [
        { email: "b@test.com", userId: "user-b" },
        { email: "a@test.com", userId: "user-a" },
      ],
      title: "t",
      topic: TOPICS.TEAMS,
    });

    expect(sent).toBe(true);
    const [messages, key] = mocks.sendEmailBatch.mock.calls[0] ?? [];
    expect(key).toBe("bulk-email");
    expect(messages.map((m: { to: string }) => m.to)).toEqual([
      "a@test.com",
      "b@test.com",
    ]);
    expect(messages[0].html).not.toBe(messages[1].html);
  });

  it("reports false when every chunk failed", async () => {
    mocks.sendEmailBatch.mockResolvedValueOnce({
      failures: [{ error: new Error("x"), recipients: ["a@test.com"] }],
      sent: 0,
      skipped: false,
    });

    await expect(
      sendBulkNotificationEmails({
        body: "b",
        idempotencyKey: "k",
        recipients: [{ email: "a@test.com", userId: "user-a" }],
        title: "t",
        topic: TOPICS.TEAMS,
      })
    ).resolves.toBe(false);
  });
});
