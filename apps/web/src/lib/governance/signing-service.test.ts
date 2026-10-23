import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/server", () => ({
  env: {
    SIGNING_SERVICE_TOKEN: "test-token",
    SIGNING_SERVICE_URL: "http://signing.test",
  },
}));

const { certificateTrusted } = await import("./signing-service");
const { userFacingError } = await import("@/lib/http-error");
const { captureThrownError, createErrorTrackingDrain, runWithErrorScope } =
  await import("@/lib/server/error-tracking");

/**
 * Calls the signing service through `fetchImpl`, turns the failure into what
 * a server function's `userFacing` rethrows, and says whether Error Tracking
 * reports it and what the person reads.
 */
async function failure(fetchImpl: typeof fetch) {
  const captureException = mock();
  createErrorTrackingDrain({ captureException }, { environment: "production" });
  const thrown = await certificateTrusted(
    { certificate: "MIIB", chain: [] },
    fetchImpl
  ).then(
    () => {
      throw new Error("expected the call to fail");
    },
    (error: Error) => userFacingError(error)
  );
  await runWithErrorScope("serverFn", () =>
    captureThrownError(thrown, { route: "startDscEnrolmentFn" }, () =>
      Promise.resolve(undefined)
    )
  );
  return {
    captured: captureException.mock.calls.length === 1,
    message: thrown.message,
  };
}

const answer = (status: number, body: unknown = {}) =>
  (() =>
    Promise.resolve(
      Response.json(body, { status })
    )) as unknown as typeof fetch;

describe("signing service failures", () => {
  it("reports an outage, keeping the message the person reads", async () => {
    const unreachable = (() =>
      Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

    expect(await failure(unreachable)).toEqual({
      captured: true,
      message: "The signing service couldn't be reached.",
    });
    expect(await failure(answer(503))).toEqual({
      captured: true,
      message: "The signing service answered 503.",
    });
  });

  it("reports a rejected token as a fault", async () => {
    expect((await failure(answer(401, { detail: "Bad token" }))).captured).toBe(
      true
    );
  });

  it("skips a refusal the service explains", async () => {
    expect(
      await failure(answer(422, { detail: "The PDF has no field Asha." }))
    ).toEqual({ captured: false, message: "The PDF has no field Asha." });
  });
});
