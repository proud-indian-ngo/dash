import { describe, expect, it } from "bun:test";

import { applyOccurrenceDate } from "./events-table-helpers";
import { parseRuleUntil } from "./rrule-until";

describe("parseRuleUntil", () => {
  it("parses UNTIL with midnight UTC", () => {
    const ms = parseRuleUntil("FREQ=WEEKLY;UNTIL=20260415T000000Z");
    expect(ms).toBe(Date.UTC(2026, 3, 15, 0, 0, 0));
  });

  it("parses UNTIL with end-of-day UTC (legacy format)", () => {
    const ms = parseRuleUntil("FREQ=DAILY;UNTIL=20260415T235959Z");
    expect(ms).toBe(Date.UTC(2026, 3, 15, 23, 59, 59));
  });

  it("returns null for rules without UNTIL", () => {
    expect(parseRuleUntil("FREQ=WEEKLY")).toBeNull();
  });

  it("returns null for malformed UNTIL (missing T-suffix)", () => {
    expect(parseRuleUntil("FREQ=WEEKLY;UNTIL=20260415")).toBeNull();
  });

  it("returns null for malformed UNTIL (missing Z)", () => {
    expect(parseRuleUntil("FREQ=WEEKLY;UNTIL=20260415T000000")).toBeNull();
  });

  it("handles BYDAY between FREQ and UNTIL", () => {
    const ms = parseRuleUntil("FREQ=WEEKLY;BYDAY=SA;UNTIL=20260601T000000Z");
    expect(ms).toBe(Date.UTC(2026, 5, 1, 0, 0, 0));
  });
});

describe("applyOccurrenceDate", () => {
  it("puts a session before 05:30 IST on its own date key", () => {
    // 04:00 IST on Sun 4 Oct is 22:30 UTC on Sat 3 Oct, keyed 2026-10-03.
    const start = Date.UTC(2026, 9, 3, 22, 30);
    expect(applyOccurrenceDate(start, start + 3_600_000, "2026-10-10")).toEqual(
      {
        endTime: Date.UTC(2026, 9, 10, 23, 30),
        startTime: Date.UTC(2026, 9, 10, 22, 30),
      }
    );
  });
});
