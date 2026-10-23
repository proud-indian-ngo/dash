import { describe, expect, it, mock } from "bun:test";

import type { WideEvent } from "evlog";
import { z } from "zod";

import { HttpError } from "@/lib/http-error";

import {
  captureThrownError,
  createErrorTrackingDrain,
  errorStatus,
  errorToReport,
  routeTemplate,
  runWithErrorScope,
  scrubError,
  scrubText,
  validationRefusal,
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

describe("scrubError", () => {
  it("drops Drizzle query params and keeps the query for grouping", () => {
    const message =
      "Failed query: select * from users where email = $1\nparams: asha@example.org,secret";
    const error = new Error(message);
    error.stack = `Error: ${message}\n    at query (db.ts:1:1)`;

    const scrubbed = scrubError(error);

    expect(scrubbed.message).toBe(
      "Failed query: select * from users where email = $1\nparams: [redacted]"
    );
    expect(scrubbed.stack).toBe(
      "Error: Failed query: select * from users where email = $1\nparams: [redacted]\n    at query (db.ts:1:1)"
    );
  });

  it("masks PII in the message, stack and causes and drops own properties", () => {
    const cause = new Error("duplicate phone +91 98765 43210");
    const error = Object.assign(
      new Error("no user asha@example.org with Bearer abcdefgh12345678", {
        cause,
      }),
      { name: "LookupError", params: ["asha@example.org"] }
    );

    const scrubbed = scrubError(error);

    expect(scrubbed.name).toBe("LookupError");
    expect(scrubbed.message).toBe("no user a***@***.org with Bearer ***");
    expect(scrubbed.stack).not.toContain("asha@example.org");
    expect((scrubbed.cause as Error).message).toBe("duplicate phone +******10");
    expect("params" in scrubbed).toBe(false);
  });

  it("masks card numbers, JWTs and IBANs", () => {
    expect(
      scrubText(
        "card 4111 1111 1111 1111 token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl iban GB82WEST12345698765432"
      )
    ).toBe("card ****1111 token eyJ***.*** iban GB82****432");
  });

  it("masks Indian mobile numbers written without a country code", () => {
    expect(
      scrubText(
        "9876543210, 98765 43210, 98765-43210, 09876543210 and 919876543210"
      )
    ).toBe("******10, ******10, ******10, ******10 and ******10");
    expect(scrubText("duplicate phone +91 98765 43210")).toBe(
      "duplicate phone +******10"
    );
  });

  it("leaves timestamps, IDs, decimals and dates that look like numbers", () => {
    const text =
      "at 1729760000 for pay_9876543210 row 0190f1e2-3a4b-7c5d-8e6f-987654321098 of 6543210987.50 paise, 123456789 on 2026-10-24";
    expect(scrubText(text)).toBe(text);
  });
});

describe("validationRefusal", () => {
  // Start's input validator throws the Standard Schema issues as JSON.
  async function startValidationError(input: unknown): Promise<Error> {
    const schema = z.object({ id: z.string().regex(/^[a-z]+$/) });
    const result = await schema["~standard"].validate(input);
    return new Error(JSON.stringify(result.issues, undefined, 2));
  }

  it("turns Start's input validation error into a 400 with its message", async () => {
    const error = await startValidationError({ id: "Not A Slug" });

    const refusal = validationRefusal(error);

    expect(refusal).toBeInstanceOf(HttpError);
    expect(refusal?.status).toBe(400);
    expect(refusal?.message).toBe(error.message);
  });

  it("leaves other errors alone", () => {
    for (const error of [
      new Error("connection reset"),
      new Error("[]"),
      new Error('["not an issue"]'),
      new Error('{"message":"an object, not issues"}'),
      new TypeError('[{"message":"Expected string"}]'),
    ]) {
      expect(validationRefusal(error)).toBeUndefined();
    }
    expect(validationRefusal('[{"message":"a string"}]')).toBeUndefined();
  });
});

describe("errorStatus", () => {
  it("takes the first numeric status, skipping better-call's string status", () => {
    const apiError = Object.assign(new Error("Invalid email"), {
      name: "APIError",
      status: "BAD_REQUEST",
      statusCode: 400,
    });

    expect(errorStatus(apiError)).toBe(400);
    expect(errorStatus(new Error("x", { cause: { statusCode: 503 } }))).toBe(
      503
    );
    expect(errorStatus(new Error("x"))).toBeUndefined();
  });
});

describe("routeTemplate", () => {
  it("replaces ID segments and drops the query", () => {
    expect(
      routeTemplate(
        "/api/teams/0190f1e2-3a4b-7c5d-8e6f-0a1b2c3d4e5f/photos/42?x=1"
      )
    ).toBe("/api/teams/:id/photos/:id");
    expect(routeTemplate("/api/files/9f86d081884c7d659a2feaa0c55ad015")).toBe(
      "/api/files/:id"
    );
    expect(routeTemplate("/api/financial-export")).toBe(
      "/api/financial-export"
    );
  });
});

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
      errorToReport(
        wideEvent({
          error: { ...serverError, status: "BAD_REQUEST", statusCode: 400 },
        })
      )
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
        path: "/api/teams/0190f1e2-3a4b-7c5d-8e6f-0a1b2c3d4e5f",
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
      route: "/api/teams/:id",
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
    expect(captureException.mock.calls[0]?.[0]).toMatchObject({
      message: "connection reset",
      stack: error.stack,
    });
    expect(captureException.mock.calls[0]?.slice(1)).toEqual([
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
      new HttpError(400, "Pick a date in this financial year"),
      new HttpError(403, "Forbidden"),
      new HttpError(404, "Role not found"),
      new HttpError(409, 'Role ID "team_lead" already exists'),
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
    const error = Object.assign(new Error("relation does not exist"), {
      name: "PostgresError",
    });

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

  it("reports distinct errors in one request", async () => {
    const { captureException, drain } = setUp();
    const original = new Error("connection reset");

    await runWithErrorScope("serverFn", async () => {
      // executeAuditedAction logs the finalize failure, then rethrows the original.
      drain({ event: wideEvent({ error: serverError, path: "audit" }) });
      await captureThrownError(original, { route: "createTeam" }, userId);
      await captureThrownError(original, { route: "createTeam" }, userId);
    });

    expect(captureException).toHaveBeenCalledTimes(2);
    expect(captureException.mock.calls[1]?.[0]).toMatchObject({
      message: "connection reset",
    });
  });

  it("sends without a user when the lookup fails", async () => {
    const { captureException } = setUp();

    await runWithErrorScope("router", () =>
      captureThrownError(new Error("timeout"), { route: "/api/jobs" }, () =>
        Promise.reject(new Error("pool exhausted"))
      )
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toBeUndefined();
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
