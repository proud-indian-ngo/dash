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

    await expect(sendEmail(email)).resolves.toEqual({
      id: "email-1",
      status: "sent",
    });

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

  const accepted = (from: number, count: number) => ({
    data: {
      data: Array.from({ length: count }, (_, i) => ({
        id: `email-${from + i}`,
      })),
    },
    error: null,
  });

  it("sends 100 emails per request with a key per chunk", async () => {
    mocks.batchSend
      .mockResolvedValueOnce(accepted(0, 100))
      .mockResolvedValueOnce(accepted(100, 100))
      .mockResolvedValueOnce(accepted(200, 50));

    const result = await sendEmailBatch(messages(250), "bulk-1-email");

    expect(result.failures).toEqual([]);
    expect(result.sent).toHaveLength(250);
    expect(result.sent[120]).toEqual({ id: "email-120", index: 120 });
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
      .mockResolvedValueOnce(accepted(100, 50));

    const result = await sendEmailBatch(messages(150), "bulk-2-email");

    expect(result.sent.map((s) => s.index)).toEqual(
      Array.from({ length: 50 }, (_, i) => 100 + i)
    );
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.recipients).toHaveLength(100);
    expect(result.failures[0]?.error).toMatchObject({
      code: "validation_error",
    });
  });
});
