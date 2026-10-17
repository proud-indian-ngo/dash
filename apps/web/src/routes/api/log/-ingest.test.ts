// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, mock } from "bun:test";

import { createRequestLogger as createRealRequestLogger } from "evlog";

import { readRequestBody } from "@/lib/read-request-body";

import { handleLogIngestRequest, type LogIngestDeps } from "./ingest";

const URL = "https://dash.proudindian.ngo/api/log/ingest";

function request(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(URL, {
    body,
    headers,
    method: "POST",
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
}

function streamOf(chunks: string[]) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) {
        controller.close();
      } else {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
    },
  });
}

function createDeps(overrides: Partial<LogIngestDeps> = {}) {
  const loggers: Array<{
    emit: ReturnType<typeof mock>;
    error: ReturnType<typeof mock>;
    set: ReturnType<typeof mock>;
  }> = [];
  const createRequestLogger = mock(() => {
    const logger = { emit: mock(), error: mock(), set: mock() };
    loggers.push(logger);
    return logger;
  });
  const checkRateLimit = mock(() => ({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: Date.now() + 60_000,
  }));
  const sendBatchToPostHogEvents = mock(
    async (_events: unknown[], _config: unknown) => undefined
  );
  const deps: LogIngestDeps = {
    checkRateLimit:
      checkRateLimit as unknown as LogIngestDeps["checkRateLimit"],
    createRequestLogger:
      createRequestLogger as unknown as LogIngestDeps["createRequestLogger"],
    postHogApiKey: "phc_test",
    postHogHost: "https://posthog.test",
    readRequestBody,
    sendBatchToPostHogEvents:
      sendBatchToPostHogEvents as unknown as LogIngestDeps["sendBatchToPostHogEvents"],
    ...overrides,
  };
  return {
    checkRateLimit,
    createRequestLogger,
    deps,
    loggers,
    sendBatchToPostHogEvents,
  };
}

describe("handleLogIngestRequest", () => {
  it("rejects a body declared over 256 KiB", async () => {
    const { deps, createRequestLogger } = createDeps();

    const response = await handleLogIngestRequest(
      request("[]", { "content-length": String(256 * 1024 + 1) }),
      deps
    );

    expect(response.status).toBe(413);
    expect(createRequestLogger).not.toHaveBeenCalled();
  });

  it("rejects a chunked body that grows over 256 KiB", async () => {
    const { deps, createRequestLogger } = createDeps();

    const response = await handleLogIngestRequest(
      request(streamOf(["x".repeat(128 * 1024), "x".repeat(128 * 1024), "x"])),
      deps
    );

    expect(response.status).toBe(413);
    expect(createRequestLogger).not.toHaveBeenCalled();
  });

  it("returns 408 when the request body cannot be read", async () => {
    const { deps } = createDeps({
      readRequestBody: mock(async () => ({
        ok: false as const,
        reason: "timeout" as const,
      })),
    });

    const response = await handleLogIngestRequest(request("[]"), deps);

    expect(response.status).toBe(408);
  });

  it("rejects invalid JSON without processing events", async () => {
    const { createRequestLogger, deps, sendBatchToPostHogEvents } =
      createDeps();

    const response = await handleLogIngestRequest(request("{"), deps);

    expect(response.status).toBe(400);
    expect(createRequestLogger).not.toHaveBeenCalled();
    expect(sendBatchToPostHogEvents).not.toHaveBeenCalled();
  });

  it("rate limits before reading the body", async () => {
    const readBody = mock(async () => ({ ok: true as const, text: "[]" }));
    const { deps } = createDeps({
      checkRateLimit: mock(() => ({
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAt: Date.now() + 30_000,
      })),
      readRequestBody: readBody,
    });

    const response = await handleLogIngestRequest(
      request("[]", { "cf-connecting-ip": "203.0.113.7" }),
      deps
    );

    expect(response.status).toBe(429);
    expect(readBody).not.toHaveBeenCalled();
    expect(deps.checkRateLimit).toHaveBeenCalledWith(
      "log-ingest:203.0.113.7",
      60
    );
  });

  it("ignores array events and non-string trace IDs", async () => {
    const { createRequestLogger, deps, sendBatchToPostHogEvents } =
      createDeps();
    const contexts = [
      null,
      { event: [] },
      { event: { level: "error", traceId: 123 } },
      { event: null },
    ];

    const response = await handleLogIngestRequest(
      request(JSON.stringify(contexts)),
      deps
    );

    expect(response.status).toBe(200);
    expect(createRequestLogger).not.toHaveBeenCalled();
    expect(sendBatchToPostHogEvents).not.toHaveBeenCalled();
  });

  it("skips deeply nested events before calling real evlog", async () => {
    const nested = `${'{"value":'.repeat(12_000)}null${"}".repeat(12_000)}`;
    const body = `[{"event":{"level":"info","nested":${nested}}}]`;
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(256 * 1024);
    const { deps, sendBatchToPostHogEvents } = createDeps({
      createRequestLogger: createRealRequestLogger,
    });

    const response = await handleLogIngestRequest(request(body), deps);

    expect(response.status).toBe(200);
    expect(sendBatchToPostHogEvents).not.toHaveBeenCalled();
  });

  it("rejects __proto__ keys before evlog merges the event", async () => {
    const { createRequestLogger, deps } = createDeps();

    const response = await handleLogIngestRequest(
      request('[{"event":{"level":"info","__proto__":{"polluted":true}}}]'),
      deps
    );

    expect(response.status).toBe(200);
    expect(createRequestLogger).not.toHaveBeenCalled();
  });

  it("caps the client batch at 25 and sends errors in one operation", async () => {
    const { deps, sendBatchToPostHogEvents } = createDeps();
    const contexts = Array.from({ length: 30 }, (_, index) => ({
      event: {
        component: "AppErrorBoundary",
        error: { name: "Error", stack: "client stack" },
        level: "error",
        message: `failure ${index}`,
        traceId: `trace-${index}`,
      },
    }));

    const response = await handleLogIngestRequest(
      request(JSON.stringify(contexts)),
      deps
    );

    expect(response.status).toBe(200);
    expect(sendBatchToPostHogEvents).toHaveBeenCalledTimes(1);
    expect(sendBatchToPostHogEvents.mock.calls[0]?.[0]).toHaveLength(25);
    expect(sendBatchToPostHogEvents.mock.calls[0]?.[0]?.[0]).toMatchObject({
      component: "AppErrorBoundary",
      error: { name: "Error", stack: "client stack" },
      level: "error",
      message: "failure 0",
      service: "pi-dash-client",
      source: "client",
      traceId: "trace-0",
    });
  });

  it("skips PostHog for empty batches and when it is not configured", async () => {
    const empty = createDeps();
    const emptyResponse = await handleLogIngestRequest(
      request("[]"),
      empty.deps
    );
    expect(emptyResponse.status).toBe(200);
    expect(empty.sendBatchToPostHogEvents).not.toHaveBeenCalled();

    const unconfigured = createDeps({ postHogApiKey: undefined });
    const unconfiguredResponse = await handleLogIngestRequest(
      request(
        JSON.stringify([{ event: { level: "error", message: "failed" } }])
      ),
      unconfigured.deps
    );
    expect(unconfiguredResponse.status).toBe(200);
    expect(unconfigured.sendBatchToPostHogEvents).not.toHaveBeenCalled();
  });

  it("accepts anonymous client logs", async () => {
    const { createRequestLogger, deps, loggers } = createDeps();

    const response = await handleLogIngestRequest(
      request(
        JSON.stringify([{ event: { level: "info", message: "loaded" } }])
      ),
      deps
    );

    expect(response.status).toBe(200);
    expect(createRequestLogger).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/log/ingest",
    });
    expect(loggers[0]?.set).toHaveBeenCalledWith({
      level: "info",
      message: "loaded",
      source: "client",
    });
    expect(loggers[0]?.emit).toHaveBeenCalledTimes(1);
  });

  it("still succeeds when the best-effort PostHog batch fails", async () => {
    const sendBatchToPostHogEvents = mock(
      async (_events: unknown[], _config: unknown) => {
        throw new Error("PostHog unavailable");
      }
    );
    const { deps } = createDeps({
      sendBatchToPostHogEvents:
        sendBatchToPostHogEvents as unknown as LogIngestDeps["sendBatchToPostHogEvents"],
    });

    const response = await handleLogIngestRequest(
      request(JSON.stringify([{ event: { level: "error" } }])),
      deps
    );
    await Bun.sleep(0);

    expect(response.status).toBe(200);
    expect(sendBatchToPostHogEvents).toHaveBeenCalledTimes(1);
  });
});
