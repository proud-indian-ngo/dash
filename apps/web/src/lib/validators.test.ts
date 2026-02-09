import { describe, expect, it } from "vitest";
import { optionalDate } from "./validators";

describe("optionalDate", () => {
  it("accepts empty string", () => {
    expect(optionalDate.safeParse("").success).toBe(true);
  });

  it("accepts valid date", () => {
    expect(optionalDate.safeParse("2025-06-15").success).toBe(true);
  });

  it("rejects invalid date string", () => {
    expect(optionalDate.safeParse("not-a-date").success).toBe(false);
  });

  it("rejects partial date", () => {
    expect(optionalDate.safeParse("2025-13-01").success).toBe(false);
  });
});
