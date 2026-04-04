import { describe, expect, it } from "vitest";
import { computeWeekRange } from "./weekly-digest-utils";

describe("computeWeekRange", () => {
  // IST = UTC + 5:30
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  it("returns Monday-to-Sunday range in IST when called on a Monday", () => {
    // Monday 2026-04-06 at 07:00 UTC = Monday 12:30 PM IST
    const now = Date.UTC(2026, 3, 6, 7, 0);
    const range = computeWeekRange(now);

    // Week should start at Monday 2026-04-06 00:00 IST = Sunday 2026-04-05 18:30 UTC
    const expectedStartUtc = Date.UTC(2026, 3, 6, 0, 0) - IST_OFFSET_MS;
    expect(range.weekStartMs).toBe(expectedStartUtc);

    // Week should end 7 days later - 1ms
    expect(range.weekEndMs).toBe(
      expectedStartUtc + 7 * 24 * 60 * 60 * 1000 - 1
    );
  });

  it("handles Sunday 11:30 PM IST (still same IST week)", () => {
    // Sunday 2026-04-12 at 18:00 UTC = Sunday 11:30 PM IST
    const now = Date.UTC(2026, 3, 12, 18, 0);
    const range = computeWeekRange(now);

    // Should still be in the week starting Monday 2026-04-06 IST
    const expectedStartUtc = Date.UTC(2026, 3, 6, 0, 0) - IST_OFFSET_MS;
    expect(range.weekStartMs).toBe(expectedStartUtc);
  });

  it("rolls to next week at Monday 00:00 IST (Sunday 18:30 UTC)", () => {
    // Sunday 2026-04-12 at 18:30 UTC = Monday 2026-04-13 00:00 IST
    const now = Date.UTC(2026, 3, 12, 18, 30);
    const range = computeWeekRange(now);

    // Should be in the week starting Monday 2026-04-13 IST
    const expectedStartUtc = Date.UTC(2026, 3, 13, 0, 0) - IST_OFFSET_MS;
    expect(range.weekStartMs).toBe(expectedStartUtc);
  });

  it("week range spans exactly 7 days", () => {
    const now = Date.UTC(2026, 3, 8, 10, 0);
    const range = computeWeekRange(now);
    const durationMs = range.weekEndMs - range.weekStartMs + 1;
    expect(durationMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("handles Wednesday mid-week", () => {
    // Wednesday 2026-04-08 at 14:00 UTC
    const now = Date.UTC(2026, 3, 8, 14, 0);
    const range = computeWeekRange(now);

    // Should still be in the week starting Monday 2026-04-06 IST
    const expectedStartUtc = Date.UTC(2026, 3, 6, 0, 0) - IST_OFFSET_MS;
    expect(range.weekStartMs).toBe(expectedStartUtc);
  });
});
