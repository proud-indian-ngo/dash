import { describe, expect, it, mock } from "bun:test";

import type { WideEvent } from "evlog";

import { HttpError } from "@/lib/http-error";

import {
  captureThrownError,
  createErrorTrackingDrain,
  errorToReport,
  runWithErrorScope,
} from "./error-tracking";

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

describe("captureThrownError", () => {
  function setUp() {
    const captureException = mock();
    const drain = createErrorTrackingDrain(
      { captureException },
      { environment: "production", release: "abc123" }
    );
    return { captureException, drain };
  }
  const userId = () => Promise.resolve("user-1");

  it("reports a thrown defect with its route, user, environment and release", async () => {
    const { captureException } = setUp();
    const error = new Error("connection reset");

    await runWithErrorScope("serverFn", () =>
      captureThrownError(
        error,
        { route: "getTeams", traceId: "trace-1" },
        userId
      )
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]).toEqual([
      error,
      "user-1",
      {
        $geoip_disable: true,
        environment: "production",
        release: "abc123",
        route: "getTeams",
        status: 500,
        traceId: "trace-1",
      },
    ]);
  });

  it("skips expected errors, aborts and thrown non-errors", async () => {
    const { captureException } = setUp();
    const resolveUser = mock(userId);

    for (const thrown of [
      new HttpError(403, "Forbidden"),
      new HttpError(404, "Role not found"),
      Object.assign(new Error("aborted"), { name: "AbortError" }),
      new Response(null, { status: 307 }),
    ]) {
      await runWithErrorScope("router", () =>
        captureThrownError(thrown, { route: "/api/jobs" }, resolveUser)
      );
    }

    expect(captureException).not.toHaveBeenCalled();
    expect(resolveUser).not.toHaveBeenCalled();
  });

  it("does not report again an error the handler already logged", async () => {
    const { captureException, drain } = setUp();
    const error = new Error("relation does not exist");

    await runWithErrorScope("router", async () => {
      drain({
        event: wideEvent({ error: serverError, path: "/api/financial-export" }),
      });
      await captureThrownError(
        error,
        { route: "/api/financial-export" },
        userId
      );
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).not.toBe(error);
  });

  it("reports each request's thrown error once", async () => {
    const { captureException } = setUp();
    const error = new Error("timeout");
    const request = () =>
      runWithErrorScope("serverFn", async () => {
        await captureThrownError(error, { route: "getTeams" }, userId);
        await captureThrownError(error, { route: "getTeams" }, userId);
      });

    await Promise.all([request(), request()]);

    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
