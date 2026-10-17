import { describe, expect, it } from "bun:test";

import { readRequestBody } from "./read-request-body";

const streamOf = (chunks: string[], { endless = false } = {}) => {
  let cancelled = false;
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel: () => {
      cancelled = true;
    },
    pull: (controller) => {
      if (endless) {
        controller.enqueue(new Uint8Array(64 * 1024));
        return;
      }
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) {
        controller.close();
      } else {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
    },
  });
  return { stream, wasCancelled: () => cancelled };
};

const requestOf = (body: BodyInit | null, headers: HeadersInit = {}) =>
  new Request("http://localhost/webhook", {
    body,
    headers,
    method: "POST",
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);

describe("readRequestBody", () => {
  it("preserves a body within the limit for signature verification", async () => {
    const { stream } = streamOf(['{"name":"Āsha', ' ₹"}']);
    expect(await readRequestBody(requestOf(stream))).toEqual({
      ok: true,
      text: '{"name":"Āsha ₹"}',
    });
  });

  it("refuses a declared oversized body before reading", async () => {
    const { stream, wasCancelled } = streamOf(["{}"]);
    const result = await readRequestBody(
      requestOf(stream, { "content-length": "11" }),
      { maxBytes: 10 }
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(wasCancelled()).toBe(true);
  });

  it("cancels an undeclared body when streamed bytes cross the limit", async () => {
    const { stream, wasCancelled } = streamOf([], { endless: true });
    const result = await readRequestBody(requestOf(stream), {
      maxBytes: 200 * 1024,
    });
    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(wasCancelled()).toBe(true);
  });

  it("reports an aborted read", async () => {
    const aborted = new ReadableStream<Uint8Array>({
      pull: () => Promise.reject(new Error("client went away")),
    });
    expect(await readRequestBody(requestOf(aborted))).toEqual({
      ok: false,
      reason: "aborted",
    });
  });

  it("cancels a stalled body on timeout", async () => {
    let cancelled = false;
    const stalled = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
      pull: () => new Promise(() => undefined),
    });
    const result = await readRequestBody(requestOf(stalled), {
      timeoutMs: 20,
    });
    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(cancelled).toBe(true);
  });
});
