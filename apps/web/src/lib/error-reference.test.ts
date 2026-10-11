import { describe, expect, it } from "bun:test";

import { getErrorReference } from "./error-reference";

describe("getErrorReference", () => {
  it("returns the same reference for the same error", () => {
    const error = new Error("boom");
    expect(getErrorReference(error)).toBe(getErrorReference(error));
  });

  it("gives different errors different references", () => {
    expect(getErrorReference(new Error("a"))).not.toBe(
      getErrorReference(new Error("a"))
    );
  });

  it("returns a 32-character hex id", () => {
    expect(getErrorReference(new Error("x"))).toMatch(/^[0-9a-f]{32}$/);
  });
});
