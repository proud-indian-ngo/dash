import { beforeEach, describe, expect, it, mock } from "bun:test";

// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.

const SECRET = "whsec-test";
const state = { routeConfig: undefined as unknown };
const recordEmailSuppression = mock(async () => undefined);
const verifyResendWebhook = mock((rawBody: string) => ({
  created_at: "2026-10-18T00:00:00.000Z",
  data: { rawBody },
  type: "email.delivered",
}));

mock.module("@pi-dash/db/queries/email-suppression", () => ({
  recordEmailSuppression,
}));
mock.module("@pi-dash/email/webhook", () => ({
  suppressionsFromEvent: () => [],
  verifyResendWebhook,
}));
mock.module("@pi-dash/env/server", () => ({
  env: { RESEND_WEBHOOK_SECRET: SECRET },
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => {
    state.routeConfig = config;
    return config;
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: mock(),
    error: mock(),
    set: mock(),
    warn: mock(),
  }),
}));

await import("./webhook");

const post = (request: Request) =>
  (
    state.routeConfig as {
      server: {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> };
      };
    }
  ).server.handlers.POST({ request });

describe("POST /api/email/webhook", () => {
  beforeEach(() => {
    recordEmailSuppression.mockClear();
    verifyResendWebhook.mockClear();
  });

  it("passes the exact raw body to signature verification", async () => {
    const body = '{"type":"email.delivered","name":"Āsha ₹"}';
    const request = new Request("http://localhost/api/email/webhook", {
      body,
      headers: { "svix-signature": "signed" },
      method: "POST",
    });

    const response = await post(request);

    expect(response.status).toBe(200);
    expect(verifyResendWebhook).toHaveBeenCalledWith(
      body,
      request.headers,
      SECRET
    );
  });

  it("refuses a body declared over 1 MB before signature verification", async () => {
    const response = await post(
      new Request("http://localhost/api/email/webhook", {
        body: "{}",
        headers: { "content-length": String(1024 * 1024 + 1) },
        method: "POST",
      })
    );

    expect(response.status).toBe(413);
    expect(verifyResendWebhook).not.toHaveBeenCalled();
  });
});
