import { describe, expect, it } from "vitest";
import { getNextOccurrenceDate } from "../recurrence";

describe("getNextOccurrenceDate", () => {
  it("weekly adds 7 days", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-01"), {
      frequency: "weekly",
    });
    expect(result).toEqual(new Date("2026-03-08"));
  });

  it("biweekly adds 14 days", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-01"), {
      frequency: "biweekly",
    });
    expect(result).toEqual(new Date("2026-03-15"));
  });

  it("monthly rolls month correctly", () => {
    const result = getNextOccurrenceDate(new Date("2026-01-15"), {
      frequency: "monthly",
    });
    expect(result).toEqual(new Date("2026-02-15"));
  });

  it("monthly handles Jan 31 rolling to Feb 28", () => {
    const result = getNextOccurrenceDate(new Date("2026-01-31"), {
      frequency: "monthly",
    });
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(1);
    expect(result?.getDate()).toBe(28);
  });

  it("respects endDate — returns date if before endDate", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-01"), {
      frequency: "weekly",
      endDate: "2026-03-20",
    });
    expect(result).toEqual(new Date("2026-03-08"));
  });

  it("returns null when past endDate", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-15"), {
      frequency: "weekly",
      endDate: "2026-03-20",
    });
    expect(result).toBeNull();
  });

  it("includes occurrence exactly on endDate", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-01"), {
      frequency: "weekly",
      endDate: "2026-03-08",
    });
    expect(result).toEqual(new Date("2026-03-08"));
  });

  it("weekly preserves time across DST spring-forward boundary", () => {
    // US DST spring forward: March 8, 2026 at 2:00 AM
    const beforeDST = new Date("2026-03-07T10:00:00");
    const result = getNextOccurrenceDate(beforeDST, { frequency: "weekly" });
    expect(result).toEqual(new Date("2026-03-14T10:00:00"));
    expect(result?.getHours()).toBe(10);
  });

  it("monthly handles month-end clamping (Mar 31 → Apr 30)", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-31"), {
      frequency: "monthly",
    });
    expect(result?.getMonth()).toBe(3); // April
    expect(result?.getDate()).toBe(30);
  });

  it("returns null for unknown frequency", () => {
    const result = getNextOccurrenceDate(new Date("2026-03-01"), {
      frequency: "daily" as never,
    });
    expect(result).toBeNull();
  });
});
