import { describe, expect, it } from "bun:test";

import { epochToLocalDate, localDateToIso } from "./local-date";

describe("local date helpers", () => {
  it("round-trips a UTC-midnight epoch to the same calendar day", () => {
    const epoch = Date.UTC(2027, 2, 31); // 31 March 2027
    const local = epochToLocalDate(epoch);
    expect(local?.getFullYear()).toBe(2027);
    expect(local?.getMonth()).toBe(2);
    expect(local?.getDate()).toBe(31);
    expect(localDateToIso(local)).toBe("2027-03-31");
  });

  it("keeps the day across the year boundary", () => {
    expect(localDateToIso(epochToLocalDate(Date.UTC(2026, 0, 1)))).toBe(
      "2026-01-01"
    );
    expect(localDateToIso(epochToLocalDate(Date.UTC(2026, 11, 31)))).toBe(
      "2026-12-31"
    );
  });

  it("treats null and undefined as unset", () => {
    expect(epochToLocalDate(null)).toBeUndefined();
    expect(epochToLocalDate(undefined)).toBeUndefined();
    expect(localDateToIso(undefined)).toBeNull();
  });
});
