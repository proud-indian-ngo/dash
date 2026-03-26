import { describe, expect, it } from "vitest";
import { applyTimeChange } from "./date-time-utils";

const base = new Date(2026, 2, 15, 10, 30); // Mar 15 2026, 10:30 AM

describe("applyTimeChange", () => {
  describe("hour", () => {
    it("sets hour in AM range", () => {
      const result = applyTimeChange(base, "hour", "3");
      expect(result.getHours()).toBe(3);
      expect(result.getMinutes()).toBe(30);
    });

    it("sets hour in PM range when base is PM", () => {
      const pmBase = new Date(2026, 2, 15, 14, 30); // 2:30 PM
      const result = applyTimeChange(pmBase, "hour", "5");
      expect(result.getHours()).toBe(17); // 5 PM
    });

    it("handles 12 AM correctly (should be 0)", () => {
      const amBase = new Date(2026, 2, 15, 9, 0); // 9:00 AM
      const result = applyTimeChange(amBase, "hour", "12");
      expect(result.getHours()).toBe(0); // 12 AM = midnight = 0
    });

    it("handles 12 PM correctly (should be 12)", () => {
      const pmBase = new Date(2026, 2, 15, 15, 0); // 3:00 PM
      const result = applyTimeChange(pmBase, "hour", "12");
      expect(result.getHours()).toBe(12); // 12 PM = noon = 12
    });
  });

  describe("minute", () => {
    it("sets minutes", () => {
      const result = applyTimeChange(base, "minute", "45");
      expect(result.getMinutes()).toBe(45);
      expect(result.getHours()).toBe(10);
    });

    it("sets minutes to 0", () => {
      const result = applyTimeChange(base, "minute", "0");
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe("ampm", () => {
    it("switches from AM to PM", () => {
      const result = applyTimeChange(base, "ampm", "PM");
      expect(result.getHours()).toBe(22); // 10 AM -> 10 PM
    });

    it("switches from PM to AM", () => {
      const pmBase = new Date(2026, 2, 15, 22, 30); // 10:30 PM
      const result = applyTimeChange(pmBase, "ampm", "AM");
      expect(result.getHours()).toBe(10); // 10 PM -> 10 AM
    });

    it("does nothing when already AM and setting AM", () => {
      const result = applyTimeChange(base, "ampm", "AM");
      expect(result.getHours()).toBe(10);
    });

    it("does nothing when already PM and setting PM", () => {
      const pmBase = new Date(2026, 2, 15, 14, 0);
      const result = applyTimeChange(pmBase, "ampm", "PM");
      expect(result.getHours()).toBe(14);
    });

    it("handles midnight (0) to PM", () => {
      const midnightBase = new Date(2026, 2, 15, 0, 0);
      const result = applyTimeChange(midnightBase, "ampm", "PM");
      expect(result.getHours()).toBe(12);
    });

    it("handles noon (12) to AM", () => {
      const noonBase = new Date(2026, 2, 15, 12, 0);
      const result = applyTimeChange(noonBase, "ampm", "AM");
      expect(result.getHours()).toBe(0);
    });
  });

  it("does not mutate the input date", () => {
    const original = new Date(2026, 2, 15, 10, 30);
    const originalTime = original.getTime();
    applyTimeChange(original, "hour", "5");
    expect(original.getTime()).toBe(originalTime);
  });
});
