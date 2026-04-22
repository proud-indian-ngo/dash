import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTraceparent, installFetchTracing } from "./tracing";

const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

describe("installFetchTracing", () => {
  const originalWindow = globalThis.window;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("window", {
      fetch: fetchMock,
      location: { origin: "http://localhost:3001" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWindow) {
      vi.stubGlobal("window", originalWindow);
    }
  });

  it("adds a new trace id for each outgoing request", async () => {
    installFetchTracing();

    await window.fetch("/first");
    await window.fetch("/second");

    const firstTraceparent = new Headers(
      fetchMock.mock.calls[0]?.[1]?.headers
    ).get("traceparent");
    const secondTraceparent = new Headers(
      fetchMock.mock.calls[1]?.[1]?.headers
    ).get("traceparent");

    expect(firstTraceparent).toMatch(TRACEPARENT_RE);
    expect(secondTraceparent).toMatch(TRACEPARENT_RE);
    expect(firstTraceparent?.split("-")[1]).not.toBe(
      secondTraceparent?.split("-")[1]
    );
  });

  it("preserves caller-provided traceparent headers", async () => {
    installFetchTracing();
    const traceparent = formatTraceparent("a".repeat(32), "b".repeat(16));

    await window.fetch("/custom", {
      headers: { traceparent },
    });

    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("traceparent")
    ).toBe(traceparent);
  });

  it("skips traceparent for cross-origin requests", async () => {
    installFetchTracing();

    await window.fetch("https://r2.cloudflarestorage.com/bucket/file.jpg", {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.has("traceparent")).toBe(false);
    expect(headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("adds traceparent for same-origin absolute URLs", async () => {
    installFetchTracing();

    await window.fetch("http://localhost:3001/api/test");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("traceparent")).toMatch(TRACEPARENT_RE);
  });
});
