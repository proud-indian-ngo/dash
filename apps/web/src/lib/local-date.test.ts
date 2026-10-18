import { describe, expect, it } from "bun:test";

import {
  epochToLocalDate,
  localDateToEpoch,
  localDateToIso,
} from "./local-date";

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

  it("writes a picked day as that day's UTC midnight east of UTC", () => {
    const tz = process.env.TZ;
    process.env.TZ = "Asia/Kolkata";
    try {
      // The picker's 16 Oct is local midnight, 18:30 UTC on 15 Oct.
      const picked = new Date(2026, 9, 16);
      expect(picked.toISOString()).toBe("2026-10-15T18:30:00.000Z");
      expect(localDateToEpoch(picked)).toBe(Date.UTC(2026, 9, 16));
      expect(localDateToIso(epochToLocalDate(localDateToEpoch(picked)))).toBe(
        "2026-10-16"
      );
    } finally {
      if (tz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = tz;
      }
    }
  });
});
