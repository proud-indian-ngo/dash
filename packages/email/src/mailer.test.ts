import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as { EMAIL_FROM?: string; RESEND_API_KEY?: string },
  logSet: vi.fn(),
  logWarn: vi.fn(),
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
    emails = { send: mocks.send };
  },
}));

import { EmailSendError, resetMailerForTests, sendEmail } from "./mailer";

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

  it("sends from EMAIL_FROM and forwards the idempotency key", async () => {
    mocks.send.mockResolvedValueOnce(sent);

    await expect(
      sendEmail({ ...email, idempotencyKey: "notif-1-email" })
    ).resolves.toBe("sent");

    expect(mocks.send).toHaveBeenCalledWith(
      { ...email, from: "noreply@example.com" },
      expect.objectContaining({ idempotencyKey: "notif-1-email" })
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
