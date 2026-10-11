import { describe, expect, it } from "bun:test";

import {
  formatCalendarDate,
  formatIndiaDateTime,
  isEventRowId,
} from "./social-format";

describe("social formatting", () => {
  it("shows times in India time", () => {
    expect(formatIndiaDateTime(Date.parse("2026-10-11T04:30:00Z"))).toBe(
      "11 Oct 2026, 10:00 IST"
    );
  });

  it("formats calendar dates without shifting them", () => {
    expect(formatCalendarDate("2026-10-18")).toBe("18 Oct 2026");
    expect(formatCalendarDate("soon")).toBe("soon");
  });

  it("links only bare uuids", () => {
    expect(isEventRowId("019a0000-0000-7000-8000-0000000000aa")).toBe(true);
    expect(
      isEventRowId("019a0000-0000-7000-8000-0000000000aa:2026-10-18")
    ).toBe(false);
    expect(isEventRowId("impact-2026-10")).toBe(false);
  });
});
