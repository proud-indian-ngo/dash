import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  freezeEmailBatchRecipients: vi.fn(),
  recordEmailMessages: vi.fn(),
  renderNotificationEmail: vi.fn(async () => "<html></html>"),
  sendEmail: vi.fn(),
  sendEmailBatch: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/db/queries/email-batch-recipients", () => ({
  freezeEmailBatchRecipients: mocks.freezeEmailBatchRecipients,
}));
vi.mock("@pi-dash/db/queries/email-message", () => ({
  recordEmailMessages: mocks.recordEmailMessages,
}));
vi.mock("@pi-dash/env/server", () => ({
  env: {
    APP_URL: "https://dash.test",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-32",
  },
}));
vi.mock("@pi-dash/email", () => ({
  FOOTER_NOTE_PLACEHOLDER: "%%NOTE%%",
  renderNotificationEmail: mocks.renderNotificationEmail,
}));
vi.mock("evlog", () => ({
  createRequestLogger: () => ({ emit: vi.fn(), error: vi.fn(), set: vi.fn() }),
}));
vi.mock("@pi-dash/email/mailer", () => ({
  EmailSendError: class extends Error {},
  sendEmail: mocks.sendEmail,
  sendEmailBatch: mocks.sendEmailBatch,
}));

import {
  buildNotificationEmail,
  renderDefaultNotificationEmail,
  sendBulkNotificationEmails,
  sendNotificationEmail,
} from "./email";
import { TOPICS } from "./topics";

const html = "<p>Hello</p><p>%%NOTE%%<a>Notification settings</a></p>";

describe("buildNotificationEmail", () => {
  it("adds the topic, unsubscribe link and one-click headers for optional topics", () => {
    const message = buildNotificationEmail({
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
});

describe("renderDefaultNotificationEmail", () => {
  it("renders the standard template with a button to the message's page", async () => {
    await renderDefaultNotificationEmail({
      body: "First.\n\nSecond.",
      clickAction: "/events/e1",
      title: "📅 RSVP from non-team member",
    });

    expect(mocks.renderNotificationEmail).toHaveBeenCalledWith({
      ctaLabel: "View in the dashboard",
      ctaUrl: "https://dash.test/events/e1",
      heading: "RSVP from non-team member",
      paragraphs: ["First.", "Second."],
    });
  });

  it("leaves the button out without a page", async () => {
    await renderDefaultNotificationEmail({ body: "b", title: "t" });

    expect(mocks.renderNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ctaLabel: undefined, ctaUrl: undefined })
    );
  });
});

describe("sendBulkNotificationEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.freezeEmailBatchRecipients.mockImplementation(
      async (_key: string, recipients: unknown) => recipients
    );
    mocks.recordEmailMessages.mockResolvedValue(undefined);
  });

  it("sorts recipients so retried jobs build the same chunks", async () => {
    mocks.sendEmailBatch.mockResolvedValueOnce({
      failures: [],
      sent: [
        { id: "email-a", index: 0 },
        { id: "email-b", index: 1 },
      ],
      skipped: false,
    });

    const sent = await sendBulkNotificationEmails({
      emailHtml: html,
      idempotencyKey: "bulk-email",
      logKey: "bulk",
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
    expect(messages[0].tags).toEqual([
      { name: "category", value: "notification" },
    ]);
    expect(mocks.recordEmailMessages).toHaveBeenCalledWith([
      { key: "bulk", resendEmailId: "email-a", userId: "user-a" },
      { key: "bulk", resendEmailId: "email-b", userId: "user-b" },
    ]);
  });

  it("reports false when every chunk failed", async () => {
    mocks.sendEmailBatch.mockResolvedValueOnce({
      failures: [{ error: new Error("x"), recipients: ["a@test.com"] }],
      sent: [],
      skipped: false,
    });

    await expect(
      sendBulkNotificationEmails({
        emailHtml: html,
        idempotencyKey: "k",
        logKey: "k",
        recipients: [{ email: "a@test.com", userId: "user-a" }],
        title: "t",
        topic: TOPICS.TEAMS,
      })
    ).resolves.toBe(false);
  });

  it("resends the first attempt's recipients when the job is retried", async () => {
    mocks.freezeEmailBatchRecipients.mockResolvedValueOnce([
      { email: "a@test.com", userId: "user-a" },
      { email: "b@test.com", userId: "user-b" },
    ]);
    mocks.sendEmailBatch.mockResolvedValueOnce({
      failures: [],
      sent: [
        { id: "email-a", index: 0 },
        { id: "email-b", index: 1 },
      ],
      skipped: false,
    });

    // user-b unsubscribed between attempts; user-c joined.
    await sendBulkNotificationEmails({
      emailHtml: html,
      idempotencyKey: "bulk-email",
      logKey: "bulk",
      recipients: [
        { email: "c@test.com", userId: "user-c" },
        { email: "a@test.com", userId: "user-a" },
      ],
      title: "t",
      topic: TOPICS.TEAMS,
    });

    expect(mocks.freezeEmailBatchRecipients).toHaveBeenCalledWith(
      "bulk-email",
      [
        { email: "a@test.com", userId: "user-a" },
        { email: "c@test.com", userId: "user-c" },
      ]
    );
    const [messages] = mocks.sendEmailBatch.mock.calls[0] ?? [];
    expect(messages.map((m: { to: string }) => m.to)).toEqual([
      "a@test.com",
      "b@test.com",
    ]);
  });

  it("sends to the current recipients when the snapshot fails", async () => {
    mocks.freezeEmailBatchRecipients.mockRejectedValueOnce(new Error("db"));
    mocks.sendEmailBatch.mockResolvedValueOnce({
      failures: [],
      sent: [{ id: "email-a", index: 0 }],
      skipped: false,
    });

    await expect(
      sendBulkNotificationEmails({
        emailHtml: html,
        idempotencyKey: "k",
        logKey: "k",
        recipients: [{ email: "a@test.com", userId: "user-a" }],
        title: "t",
        topic: TOPICS.TEAMS,
      })
    ).resolves.toBe(true);
    const [messages] = mocks.sendEmailBatch.mock.calls[0] ?? [];
    expect(messages.map((m: { to: string }) => m.to)).toEqual(["a@test.com"]);
  });
});

describe("sendNotificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const send = () =>
    sendNotificationEmail({
      emailHtml: html,
      idempotencyKey: "digest-batch-1-email",
      logKey: "digest-batch-1",
      title: "t",
      toEmail: "a@test.com",
      userId: "user-a",
    });

  it("logs the accepted email under its log key", async () => {
    mocks.sendEmail.mockResolvedValueOnce({ id: "email-1", status: "sent" });
    mocks.recordEmailMessages.mockResolvedValueOnce(undefined);

    await expect(send()).resolves.toBe(true);
    expect(mocks.recordEmailMessages).toHaveBeenCalledWith([
      { key: "digest-batch-1", resendEmailId: "email-1", userId: "user-a" },
    ]);
  });

  it("still reports the email sent when the log write fails", async () => {
    mocks.sendEmail.mockResolvedValueOnce({ id: "email-1", status: "sent" });
    mocks.recordEmailMessages.mockRejectedValueOnce(new Error("db"));

    await expect(send()).resolves.toBe(true);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("logs nothing when email is skipped", async () => {
    mocks.sendEmail.mockResolvedValueOnce({ status: "skipped" });

    await expect(send()).resolves.toBe(false);
    expect(mocks.recordEmailMessages).not.toHaveBeenCalled();
  });
});
