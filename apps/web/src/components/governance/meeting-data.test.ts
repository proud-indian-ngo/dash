import { describe, expect, it } from "bun:test";

import { meetingDayHeading } from "./meeting-data";

// 20 Oct 2026, 11 pm and 21 Oct 2026, 1 am in India.
const lateOn20th = Date.parse("2026-10-20T23:00:00+05:30");
const earlyOn21st = Date.parse("2026-10-21T01:00:00+05:30");

describe("meetingDayHeading", () => {
  it("marks today and tomorrow by India's day", () => {
    expect(meetingDayHeading(lateOn20th, "2026-10-20")).toMatch(/^Today · /);
    expect(meetingDayHeading(earlyOn21st, "2026-10-20")).toMatch(
      /^Tomorrow · /
    );
  });

  it("moves on once India's day does", () => {
    expect(meetingDayHeading(lateOn20th, "2026-10-21")).not.toMatch(
      /^(Today|Tomorrow)/
    );
    expect(meetingDayHeading(earlyOn21st, "2026-10-21")).toMatch(/^Today · /);
  });

  it("adds the year outside this year", () => {
    expect(meetingDayHeading(lateOn20th, "2027-01-05")).toContain("2026");
  });
});
