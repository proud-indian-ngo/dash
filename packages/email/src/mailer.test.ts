import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as { EMAIL_FROM?: string; RESEND_API_KEY?: string },
  logSet: vi.fn(),
  logWarn: vi.fn(),
  batchSend: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@pi-dash/env/server", () => ({ env: mocks.env }));

vi.mock("evlog", () => ({
  createRequestLogger: () => ({
    emit: vi.fn(),
    set: mocks.logSet,
    warn: mocks.logWarn,
  }),
}));

vi.mock("resend", () => ({
  Resend: class {
    batch = { send: mocks.batchSend };
    emails = { send: mocks.send };
  },
}));

import {
  EmailSendError,
  resetMailerForTests,
  sendEmail,
  sendEmailBatch,
} from "./mailer";

const email = { html: "<p>Hi</p>", subject: "Hello", to: "a@example.com" };

function rateLimited() {
  return {
    data: null,
    error: {
      message: "Too many requests",
      name: "rate_limit_exceeded",
      statusCode: 429,
    },
    headers: { "retry-after": "0.01" },
  };
}

const sent = { data: { id: "email-1" }, error: null, headers: null };

describe("sendEmail", () => {
  beforeEach(() => {
    resetMailerForTests();
    vi.clearAllMocks();
    mocks.env.RESEND_API_KEY = "re_test";
    mocks.env.EMAIL_FROM = "noreply@example.com";
  });

  it("skips and names the missing variables when Resend isn't configured", async () => {
    mocks.env.RESEND_API_KEY = undefined;

    await expect(sendEmail(email)).resolves.toBe("skipped");

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.logWarn).toHaveBeenCalledWith("email_not_configured");
    expect(mocks.logSet).toHaveBeenCalledWith({
      missing: ["RESEND_API_KEY"],
      subject: "Hello",
    });
  });

  it("sends from EMAIL_FROM with a plain-text part and the idempotency key", async () => {
    mocks.send.mockResolvedValueOnce(sent);

    await expect(
      sendEmail({ ...email, idempotencyKey: "notif-1-email" })
    ).resolves.toBe("sent");

    expect(mocks.send).toHaveBeenCalledWith(
      { ...email, from: "noreply@example.com", text: "Hi" },
      expect.objectContaining({ idempotencyKey: "notif-1-email" })
    );
  });

  it("passes attachments through to Resend", async () => {
    mocks.send.mockResolvedValueOnce(sent);
    const attachments = [
      { content: Buffer.from("%PDF-1.4"), filename: "PI-2026-27-0001.pdf" },
    ];

    await expect(sendEmail({ ...email, attachments })).resolves.toBe("sent");

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ attachments }),
      expect.anything()
    );
  });

  it("throws EmailSendError with the Resend code when rejected", async () => {
    mocks.send.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Invalid `from` field",
        name: "invalid_from_address",
        statusCode: 422,
      },
      headers: null,
    });

    const error = await sendEmail(email).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({
      code: "invalid_from_address",
      statusCode: 422,
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("retries rate-limited sends", async () => {
    mocks.send.mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(sent);

    await expect(sendEmail(email)).resolves.toBe("sent");

    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("gives up after three rate-limited attempts", async () => {
    mocks.send.mockResolvedValue(rateLimited());

    await expect(sendEmail(email)).rejects.toMatchObject({
      code: "rate_limit_exceeded",
    });
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });
});

describe("sendEmailBatch", () => {
  beforeEach(() => {
    resetMailerForTests();
    vi.clearAllMocks();
    mocks.env.RESEND_API_KEY = "re_test";
    mocks.env.EMAIL_FROM = "noreply@example.com";
  });

  const messages = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      ...email,
      to: `user${i}@example.com`,
    }));

  it("sends 100 emails per request with a key per chunk", async () => {
    mocks.batchSend.mockResolvedValue({ data: { data: [] }, error: null });

    const result = await sendEmailBatch(messages(250), "bulk-1-email");

    expect(result).toEqual({ failures: [], sent: 250, skipped: false });
    expect(mocks.batchSend).toHaveBeenCalledTimes(3);
    const calls = mocks.batchSend.mock.calls;
    expect(calls.map(([payload]) => payload.length)).toEqual([100, 100, 50]);
    expect(calls.map(([, options]) => options.idempotencyKey)).toEqual([
      "bulk-1-email-0",
      "bulk-1-email-1",
      "bulk-1-email-2",
    ]);
    expect(calls[0]?.[0][0]).toMatchObject({
      from: "noreply@example.com",
      text: "Hi",
      to: "user0@example.com",
    });
  });

  it("reports a rejected chunk and still sends the rest", async () => {
    mocks.batchSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Bad", name: "validation_error", statusCode: 422 },
        headers: null,
      })
      .mockResolvedValueOnce({ data: { data: [] }, error: null });

    const result = await sendEmailBatch(messages(150), "bulk-2-email");

    expect(result.sent).toBe(50);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.recipients).toHaveLength(100);
    expect(result.failures[0]?.error).toMatchObject({
      code: "validation_error",
    });
  });

  it("skips without calling Resend when unconfigured", async () => {
    mocks.env.EMAIL_FROM = undefined;

    const result = await sendEmailBatch(messages(3), "bulk-3-email");

    expect(result).toEqual({ failures: [], sent: 0, skipped: true });
    expect(mocks.batchSend).not.toHaveBeenCalled();
  });
});
