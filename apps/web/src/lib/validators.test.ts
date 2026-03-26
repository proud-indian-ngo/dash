import { describe, expect, it } from "vitest";
import { optionalDate } from "./validators";

describe("optionalDate", () => {
  it("accepts undefined", () => {
    expect(optionalDate.safeParse(undefined).success).toBe(true);
  });

  it("accepts valid Date", () => {
    expect(optionalDate.safeParse(new Date(2025, 5, 15)).success).toBe(true);
  });

  it("rejects string", () => {
    expect(optionalDate.safeParse("2025-06-15").success).toBe(false);
  });

  it("rejects number", () => {
    expect(optionalDate.safeParse(12_345).success).toBe(false);
  });
});
