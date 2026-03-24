import { describe, expect, it } from "vitest";
import {
  datetimeLocalToEpoch,
  epochToDatetimeLocal,
  ISO_DATETIME_LOCAL,
} from "./date-formats";

describe("epochToDatetimeLocal", () => {
  it("converts epoch to datetime-local string", () => {
    // 2024-06-15T10:30 in local time
    const date = new Date(2024, 5, 15, 10, 30);
    const result = epochToDatetimeLocal(date.getTime());
    expect(result).toBe("2024-06-15T10:30");
  });

  it("pads single-digit months and days", () => {
    const date = new Date(2024, 0, 5, 9, 5);
    const result = epochToDatetimeLocal(date.getTime());
    expect(result).toBe("2024-01-05T09:05");
  });

  it("handles midnight", () => {
    const date = new Date(2024, 11, 31, 0, 0);
    const result = epochToDatetimeLocal(date.getTime());
    expect(result).toBe("2024-12-31T00:00");
  });
});

describe("datetimeLocalToEpoch", () => {
  it("converts datetime-local string to epoch", () => {
    const epoch = datetimeLocalToEpoch("2024-06-15T10:30");
    const date = new Date(2024, 5, 15, 10, 30);
    expect(epoch).toBe(date.getTime());
  });

  it("handles midnight", () => {
    const epoch = datetimeLocalToEpoch("2024-12-31T00:00");
    const date = new Date(2024, 11, 31, 0, 0);
    expect(epoch).toBe(date.getTime());
  });
});

describe("round-trip conversion", () => {
  it("epochToDatetimeLocal -> datetimeLocalToEpoch preserves epoch (minute precision)", () => {
    // Use a time with no seconds/ms so round-trip is exact
    const original = new Date(2025, 2, 15, 14, 45, 0, 0).getTime();
    const str = epochToDatetimeLocal(original);
    const roundTripped = datetimeLocalToEpoch(str);
    expect(roundTripped).toBe(original);
  });

  it("datetimeLocalToEpoch -> epochToDatetimeLocal preserves string", () => {
    const original = "2025-08-01T08:00";
    const epoch = datetimeLocalToEpoch(original);
    const roundTripped = epochToDatetimeLocal(epoch);
    expect(roundTripped).toBe(original);
  });

  it("rounds down seconds/ms in round-trip", () => {
    // Epoch with seconds — datetime-local drops them, so round-trip loses seconds
    const withSeconds = new Date(2025, 0, 1, 12, 30, 45, 500).getTime();
    const withoutSeconds = new Date(2025, 0, 1, 12, 30, 0, 0).getTime();
    const str = epochToDatetimeLocal(withSeconds);
    const roundTripped = datetimeLocalToEpoch(str);
    expect(roundTripped).toBe(withoutSeconds);
  });
});

describe("ISO_DATETIME_LOCAL format constant", () => {
  it("matches the expected pattern", () => {
    expect(ISO_DATETIME_LOCAL).toBe("yyyy-MM-dd'T'HH:mm");
  });
});
