import { describe, expect, it, mock } from "bun:test";

import type { WideEvent } from "evlog";

import { createErrorTrackingDrain, errorToReport } from "./error-tracking";

function wideEvent(fields: Record<string, unknown>): WideEvent {
  return {
    environment: "production",
    level: "error",
    service: "pi-dash",
    timestamp: "2026-10-19T00:00:00.000Z",
    ...fields,
  };
}

const serverError = {
  message: "relation does not exist",
  name: "PostgresError",
  stack: "PostgresError: relation does not exist\n    at query (db.ts:1:1)",
};

describe("errorToReport", () => {
  it("rebuilds the error with its name, message and stack", () => {
    const error = errorToReport(wideEvent({ error: serverError }));

    expect(error).toBeInstanceOf(Error);
    expect(error?.name).toBe("PostgresError");
    expect(error?.message).toBe("relation does not exist");
    expect(error?.stack).toBe(serverError.stack);
  });

  it("skips events that are not server errors", () => {
    expect(
      errorToReport(wideEvent({ error: serverError, level: "warn" }))
    ).toBeUndefined();
    expect(
      errorToReport(wideEvent({ error: serverError, source: "client" }))
    ).toBeUndefined();
    expect(errorToReport(wideEvent({ message: "no error" }))).toBeUndefined();
  });

  it("skips aborted requests and 4xx errors", () => {
    expect(
      errorToReport(
        wideEvent({ error: { message: "aborted", name: "AbortError" } })
      )
    ).toBeUndefined();
    expect(
      errorToReport(wideEvent({ error: { ...serverError, status: 403 } }))
    ).toBeUndefined();
    expect(
      errorToReport(wideEvent({ error: { ...serverError, statusCode: 404 } }))
    ).toBeUndefined();
    expect(
      errorToReport(wideEvent({ error: { ...serverError, status: 502 } }))
    ).toBeInstanceOf(Error);
  });
});

describe("createErrorTrackingDrain", () => {
  it("captures with request context, environment and release", () => {
    const captureException = mock();
    const drain = createErrorTrackingDrain(
      { captureException },
      { environment: "production", release: "abc123" }
    );

    drain({
      event: wideEvent({
        error: serverError,
        path: "/api/teams",
        requestId: "trace-1",
        status: 500,
        userId: "user-1",
      }),
    });
    drain({ event: wideEvent({ level: "info", path: "/api/teams" }) });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toBe("user-1");
    expect(captureException.mock.calls[0]?.[2]).toEqual({
      $geoip_disable: true,
      environment: "production",
      release: "abc123",
      route: "/api/teams",
      status: 500,
      traceId: "trace-1",
    });
  });
});
