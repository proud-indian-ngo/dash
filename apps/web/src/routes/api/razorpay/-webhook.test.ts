import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";

// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.

const SECRET = "whsec-test";
const state = {
  routeConfig: undefined as unknown,
  setup: {} as Record<string, unknown>,
};
const enqueue = mock(async (..._args: unknown[]) => "job-1");
const stage = mock(async (..._args: unknown[]) => ({
  batchId: "b",
  day: "2026-10-12",
  rowId: "r",
  staged: "new",
}));

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/db/queries/razorpay-import", () => ({
  writeRazorpayConfig: async () => undefined,
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => {
    state.routeConfig = config;
    return config;
  },
}));
mock.module("@/lib/razorpay/config", () => ({
  razorpaySetup: () => state.setup,
}));
mock.module("@/lib/razorpay/ingest", () => ({
  stageRazorpayPayment: stage,
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
  createHmac("sha256", SECRET).update(body).digest("hex");

const delivery = (entity: Record<string, unknown>) =>
  JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          amount: 50_000,
          created_at: 1_791_900_000,
          currency: "INR",
          id: "pay_Test0001",
          status: "captured",
          ...entity,
        },
      },
    },
  });

const requestOf = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/razorpay/webhook", {
    body,
    headers: { "x-razorpay-signature": sign(body), ...headers },
    method: "POST",
  });

const enabled = (overrides: Record<string, unknown> = {}) => ({
  apiKey: null,
  enabled: true,
  mode: "test",
  testInProduction: false,
  webhookSecret: SECRET,
  ...overrides,
});

describe("POST /api/razorpay/webhook", () => {
  beforeEach(() => {
    state.setup = enabled();
    enqueue.mockClear();
    stage.mockClear();
  });

  it("stages a signed captured payment and queues its sync", async () => {
    const response = await post(requestOf(delivery({})));
    expect(response.status).toBe(200);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls).toEqual([
      [
        "razorpay-sync-payment",
        { day: "2026-10-12", paymentId: "pay_Test0001" },
        { singletonKey: "pay_Test0001" },
      ],
    ]);
  });

  it("refuses a body declared over 1 MB with 413, before checking anything", async () => {
    const response = await post(
      requestOf(delivery({}), { "content-length": String(1024 * 1024 + 1) })
    );
    expect(response.status).toBe(413);
    expect(stage).not.toHaveBeenCalled();
  });

  it("refuses an undeclared body that grows past 1 MB with 413", async () => {
    const big = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        controller.enqueue(new Uint8Array(256 * 1024));
      },
    });
    const response = await post(
      new Request("http://localhost/api/razorpay/webhook", {
        body: big,
        duplex: "half",
        method: "POST",
      } as RequestInit)
    );
    expect(response.status).toBe(413);
  });

  it("answers a body the client aborted with 400, never a 500", async () => {
    const aborted = new ReadableStream<Uint8Array>({
      pull: () => Promise.reject(new Error("client went away")),
    });
    const response = await post(
      new Request("http://localhost/api/razorpay/webhook", {
        body: aborted,
        duplex: "half",
        method: "POST",
      } as RequestInit)
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Failed to read webhook body",
    });
    expect(stage).not.toHaveBeenCalled();
  });

  it("acknowledges but never records a delivery when a test key runs in production", async () => {
    state.setup = enabled({ testInProduction: true });
    const response = await post(requestOf(delivery({})));
    expect(response.status).toBe(200);
    expect(stage).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    // Unsigned deliveries are still refused.
    const unsigned = await post(
      new Request("http://localhost/api/razorpay/webhook", {
        body: delivery({}),
        method: "POST",
      })
    );
    expect(unsigned.status).toBe(401);
  });

  it("queues a fetch by ID for an unreadable payment when the key secret is set", async () => {
    state.setup = enabled({ apiKey: { id: "rzp_test_x", secret: "k" } });
    const response = await post(requestOf(delivery({ amount: "500" })));
    expect(response.status).toBe(200);
    expect(stage).not.toHaveBeenCalled();
    expect(enqueue.mock.calls).toEqual([
      [
        "razorpay-sync-payment",
        { paymentId: "pay_Test0001" },
        { singletonKey: "pay_Test0001" },
      ],
    ]);
  });

  it("acknowledges an unreadable payment without a key secret and records nothing", async () => {
    const response = await post(requestOf(delivery({ amount: "500" })));
    expect(response.status).toBe(200);
    expect(stage).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
