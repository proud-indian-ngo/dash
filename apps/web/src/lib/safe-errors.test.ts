import { describe, expect, it } from "bun:test";

import { HttpError } from "./http-error";
import {
  databaseErrorFields,
  sanitizedError,
  withSafeErrors,
} from "./safe-errors";

describe("sanitizedError", () => {
  it("keeps the error's name and Postgres code, never its message", () => {
    const cause = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "import_row_pkey",
      detail: "Key (email)=(asha@example.test) already exists",
      table: "import_row",
    });
    const error = new Error(
      'Failed query: insert into "import_row" params: {"email":"asha@example.test"}',
      { cause }
    );
    expect(databaseErrorFields(error)).toEqual({
      constraint: "import_row_pkey",
      sqlState: "23505",
      table: "import_row",
    });
    const safe = sanitizedError(error, "razorpay_stage_failed");
    expect(safe.message).toBe("razorpay_stage_failed: Error (23505)");
    expect(safe.cause).toBeUndefined();
    expect(safe.message).not.toContain("asha");
  });

  it("handles values that are not errors", () => {
    expect(sanitizedError("boom", "ctx").message).toBe("ctx: string");
  });
});

describe("withSafeErrors", () => {
  class Refusal extends Error {
    readonly row = { email: "asha@example.test" };
  }
  const options = {
    fields: {},
    isUserFacing: (error: unknown) =>
      error instanceof Refusal || error instanceof HttpError,
    message: "The import couldn't be saved.",
    path: "test",
  };

  it("answers a refusal written for the user as a 409 with only its message", async () => {
    const thrown = await withSafeErrors(options, () =>
      Promise.reject(new Refusal("This batch is already importing"))
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({
      message: "This batch is already importing",
      status: 409,
    });
    expect("row" in (thrown as object)).toBe(false);
  });

  it("keeps an HttpError's own status", async () => {
    const forbidden = new HttpError(403, "Forbidden");
    await expect(
      withSafeErrors(options, () => Promise.reject(forbidden))
    ).rejects.toBe(forbidden);
  });

  it("replaces anything else with the generic message", async () => {
    const thrown = await withSafeErrors(options, () =>
      Promise.reject(new Error("duplicate key asha@example.test"))
    ).catch((error: unknown) => error);

    expect(thrown).not.toBeInstanceOf(HttpError);
    expect((thrown as Error).message).toBe("The import couldn't be saved.");
  });
});
