import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDateOnOrBeforeToday } from "./validation";

describe("isDateOnOrBeforeToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for today's date", () => {
    expect(isDateOnOrBeforeToday("2025-06-15")).toBe(true);
  });

  it("returns true for a past date", () => {
    expect(isDateOnOrBeforeToday("2024-01-01")).toBe(true);
  });

  it("returns false for a future date", () => {
    expect(isDateOnOrBeforeToday("2025-12-25")).toBe(false);
  });

  it("returns false for invalid date string", () => {
    expect(isDateOnOrBeforeToday("not-a-date")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDateOnOrBeforeToday("")).toBe(false);
  });

  it("returns true for yesterday", () => {
    expect(isDateOnOrBeforeToday("2025-06-14")).toBe(true);
  });
});
