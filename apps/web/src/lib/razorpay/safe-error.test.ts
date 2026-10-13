import { describe, expect, it } from "bun:test";

import { safeErrorFields, sanitizedError } from "./safe-error";

describe("sanitizedError", () => {
  it("keeps the error's name and Postgres code, never its message", () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    const error = new Error(
      'Failed query: insert into "import_row" params: {"email":"asha@example.test"}',
      { cause }
    );
    expect(safeErrorFields(error)).toEqual({
      errorCode: "23505",
      errorName: "Error",
    });
    const safe = sanitizedError(error, "razorpay_stage_failed");
    expect(safe.message).toBe("razorpay_stage_failed: Error (23505)");
    expect(safe.message).not.toContain("asha");
  });

  it("handles values that are not errors", () => {
    expect(sanitizedError("boom", "ctx").message).toBe("ctx: string");
  });
});
