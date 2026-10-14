import { describe, expect, it } from "bun:test";

import { databaseErrorFields, sanitizedError } from "./safe-errors";

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
