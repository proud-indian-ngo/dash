import { describe, expect, it } from "vitest";

import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
} from "./trace-context";

describe("parseTraceparent", () => {
  it("parses valid traceparent", () => {
    const result = parseTraceparent(
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
    );
    expect(result).toEqual({
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
      traceId: "0af7651916cd43dd8448eb211c80319c",
    });
  });

  it("parses flags 00", () => {
    const result = parseTraceparent(
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00"
    );
    expect(result?.traceFlags).toBe(0);
  });

  it("returns null for null/undefined", () => {
    expect(parseTraceparent(null)).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTraceparent("")).toBeNull();
  });

  it("returns null for wrong version", () => {
    expect(
      parseTraceparent(
        "01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
      )
    ).toBeNull();
  });

  it("returns null for wrong traceId length", () => {
    expect(
      parseTraceparent("00-0af7651916cd43dd-b7ad6b7169203331-01")
    ).toBeNull();
  });

  it("returns null for wrong spanId length", () => {
    expect(
      parseTraceparent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b71-01")
    ).toBeNull();
  });

  it("returns null for non-hex characters", () => {
    expect(
      parseTraceparent(
        "00-ZZZZ651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
      )
    ).toBeNull();
  });

  it("roundtrips with formatTraceparent", () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const header = formatTraceparent(traceId, spanId);
    const parsed = parseTraceparent(header);
    expect(parsed).toEqual({ spanId, traceFlags: 1, traceId });
  });
});
