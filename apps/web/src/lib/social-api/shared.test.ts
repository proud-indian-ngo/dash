import { describe, expect, it } from "bun:test";

import { readJsonBody, SOCIAL_MAX_BODY_BYTES } from "./shared";

const request = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://dash.proudindian.ngo/api/social/v1/runs", {
    body,
    headers,
    method: "POST",
  });

describe("readJsonBody", () => {
  it("parses a small body and maps malformed JSON to null", async () => {
    expect(await readJsonBody(request('{"a":1}'))).toEqual({ body: { a: 1 } });
    expect(await readJsonBody(request("not json"))).toEqual({ body: null });
  });

  it("refuses a declared Content-Length over 64 KB before reading", async () => {
    const result = await readJsonBody(
      request("{}", { "content-length": String(SOCIAL_MAX_BODY_BYTES + 1) })
    );
    expect("tooLarge" in result && result.tooLarge.status).toBe(413);
  });

  it("refuses an oversized body without a usable Content-Length", async () => {
    const big = JSON.stringify({ x: "y".repeat(SOCIAL_MAX_BODY_BYTES) });
    const result = await readJsonBody(request(big, { "content-length": "x" }));
    expect("tooLarge" in result && result.tooLarge.status).toBe(413);
    expect(
      "tooLarge" in result && result.tooLarge.headers.get("Cache-Control")
    ).toBe("no-store");
  });
});
