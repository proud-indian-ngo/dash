import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";

// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.

const SECRET = "whatsapp-webhook-test-secret";
const state = { routeConfig: undefined as unknown };
const processPollVote = mock(
  async (..._args: unknown[]) => "processed" as const
);
const requestLog = {
  emit: mock(),
  error: mock(),
  set: mock(),
  warn: mock(),
};

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({
  env: { WHATSAPP_WEBHOOK_SECRET: SECRET },
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: mock() }));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: mock(),
}));
mock.module("@pi-dash/observability", () => ({
  withFireAndForgetLog: mock(),
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => {
    state.routeConfig = config;
    return config;
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: mock(() => requestLog),
}));

const { whatsAppPollVoteWebhookSchema } = await import("@/lib/whatsapp-rsvp");

mock.module("@/lib/whatsapp-rsvp", () => ({
  processWhatsAppPollVoteWebhook: processPollVote,
  whatsAppPollVoteWebhookSchema,
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

const sign = (body: string) =>
  `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

const requestOf = (body: string, signature = sign(body)) =>
  new Request("http://localhost/api/whatsapp/webhook", {
    body,
    headers: { "x-hub-signature-256": signature },
    method: "POST",
  });

const delivery = (poll: Record<string, unknown> = {}) => ({
  device_id: "919999999999@s.whatsapp.net",
  event: "message",
  payload: {
    chat_id: "120363000000000000@g.us",
    from: "919876543210@s.whatsapp.net",
    from_lid: "123456789@lid",
    from_name: "Volunteer",
    id: "VOTE-1",
    is_from_me: false,
    poll: {
      poll_id: "POLL-1",
      resolution_status: "resolved",
      selected_option_hashes: ["yes-hash"],
      type: "vote",
      ...poll,
    },
    timestamp: "2026-10-16T10:30:00Z",
  },
});

const send = (value: unknown) => post(requestOf(JSON.stringify(value)));

describe("POST /api/whatsapp/webhook", () => {
  beforeEach(() => {
    processPollVote.mockClear();
  });

  it("dispatches a valid signed upstream poll vote", async () => {
    const webhook = delivery();
    const response = await send(webhook);

    expect(response.status).toBe(200);
    expect(processPollVote).toHaveBeenCalledTimes(1);
    expect(processPollVote).toHaveBeenCalledWith(webhook);
  });

  it("dispatches a cleared vote", async () => {
    const webhook = delivery({ selected_option_hashes: [] });

    expect((await send(webhook)).status).toBe(200);
    expect(processPollVote).toHaveBeenCalledWith(webhook);
  });

  it("dispatches hashes when the poll definition is missing", async () => {
    const webhook = delivery({
      resolution_status: "definition_missing",
      selected_option_hashes: ["unknown-hash"],
    });

    expect((await send(webhook)).status).toBe(200);
    expect(processPollVote).toHaveBeenCalledWith(webhook);
  });

  it.each([
    [
      "ordinary text",
      {
        ...delivery(),
        payload: { ...delivery().payload, poll: undefined, body: "Hello" },
      },
    ],
    ["poll creation", delivery({ type: "creation" })],
    ["poll edit", delivery({ type: "edit" })],
    ["poll add-option message", delivery({ type: "add_option" })],
    ["non-message event", { ...delivery(), event: "message.edited" }],
  ])("acknowledges and ignores %s", async (_name, webhook) => {
    expect((await send(webhook)).status).toBe(200);
    expect(processPollVote).not.toHaveBeenCalled();
  });

  it.each([
    [
      "omitted hashes",
      delivery({
        resolution_status: "decrypt_failed",
        selected_option_hashes: undefined,
      }),
    ],
    [
      "empty hashes",
      delivery({
        resolution_status: "decrypt_failed",
        selected_option_hashes: [],
      }),
    ],
    ["absent hashes", delivery({ selected_option_hashes: undefined })],
    ["null hashes", delivery({ selected_option_hashes: null })],
  ])("acknowledges and ignores a vote with %s", async (_name, webhook) => {
    expect((await send(webhook)).status).toBe(200);
    expect(processPollVote).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature without processing", async () => {
    const body = JSON.stringify(delivery());
    const response = await post(requestOf(body, `sha256=${"0".repeat(64)}`));

    expect(response.status).toBe(401);
    expect(processPollVote).not.toHaveBeenCalled();
  });

  it("rejects malformed signed JSON without processing", async () => {
    const body = "{not-json";
    const response = await post(requestOf(body));

    expect(response.status).toBe(400);
    expect(processPollVote).not.toHaveBeenCalled();
  });

  it("refuses a body declared over 1 MB before signature verification", async () => {
    const body = JSON.stringify(delivery());
    const request = requestOf(body);
    request.headers.set("content-length", String(1024 * 1024 + 1));

    const response = await post(request);

    expect(response.status).toBe(413);
    expect(processPollVote).not.toHaveBeenCalled();
  });
});
