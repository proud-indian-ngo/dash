import { randomBytes } from "node:crypto";

const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export interface TraceContext {
  spanId: string;
  traceFlags: number;
  traceId: string;
}

export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

export function parseTraceparent(
  header: string | null | undefined
): TraceContext | null {
  if (!header) {
    return null;
  }
  const match = TRACEPARENT_RE.exec(header);
  if (!match) {
    return null;
  }
  const [, traceId, spanId, flags] = match;
  if (!(traceId && spanId && flags)) {
    return null;
  }
  return { traceId, spanId, traceFlags: Number.parseInt(flags, 16) };
}

export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}
