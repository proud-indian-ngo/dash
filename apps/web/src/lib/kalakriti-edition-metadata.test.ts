import { describe, expect, it } from "vitest";
import {
  calendarDateFromTimestamp,
  getRegistrationCloseTimestamp,
  registrationCloseDefaults,
} from "./kalakriti-edition-metadata";

describe("Kalakriti Edition metadata dates", () => {
  it("round-trips the fixed Kolkata registration timestamp", () => {
    const date = new Date(2028, 9, 31);
    const timestamp = getRegistrationCloseTimestamp(date, "18:15");

    expect(timestamp).toBe(new Date("2028-10-31T18:15:00+05:30").getTime());
    expect(registrationCloseDefaults(timestamp)).toEqual({
      date,
      time: "18:15",
    });
  });

  it("turns a Zero date value into a calendar date without shifting the day", () => {
    expect(
      calendarDateFromTimestamp(new Date("2028-11-21T00:00:00Z").getTime())
    ).toEqual(new Date(2028, 10, 21));
  });
});
