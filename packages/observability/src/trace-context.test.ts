import { describe, expect, it } from "vitest";
import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
} from "./trace-context";

const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_16 = /^[0-9a-f]{16}$/;

describe("generateTraceId", () => {
  it("returns 32 hex characters", () => {
    const id = generateTraceId();
    expect(id).toMatch(HEX_32);
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe("generateSpanId", () => {
  it("returns 16 hex characters", () => {
    const id = generateSpanId();
    expect(id).toMatch(HEX_16);
  });
});

describe("formatTraceparent", () => {
  it("formats as W3C traceparent with version 00 and flags 01", () => {
    const result = formatTraceparent(
      "0af7651916cd43dd8448eb211c80319c",
      "b7ad6b7169203331"
    );
    expect(result).toBe(
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
    );
  });
});

describe("parseTraceparent", () => {
  it("parses valid traceparent", () => {
    const result = parseTraceparent(
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
    );
    expect(result).toEqual({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
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
    expect(parsed).toEqual({ traceId, spanId, traceFlags: 1 });
  });
});
