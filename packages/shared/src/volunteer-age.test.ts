import { describe, expect, it } from "vitest";

import {
  ageInYears,
  isVolunteerAgeEligible,
  isVolunteerAgeEligibleOnServer,
  latestVolunteerDob,
} from "./volunteer-age";

const today = new Date(2026, 9, 9);

describe("volunteer age", () => {
  it("turns 18 on the birthday, not the day before", () => {
    expect(isVolunteerAgeEligible(new Date(2008, 9, 9), today)).toBe(true);
    expect(isVolunteerAgeEligible(new Date(2008, 9, 10), today)).toBe(false);
    expect(isVolunteerAgeEligible(new Date(1990, 0, 1), today)).toBe(true);
  });

  it("rejects a date of birth in the future", () => {
    expect(isVolunteerAgeEligible(new Date(2027, 0, 1), today)).toBe(false);
  });

  it("counts a leap-day birthday from March 1 in common years", () => {
    const leap = new Date(2008, 1, 29);
    expect(ageInYears(leap, new Date(2026, 1, 28))).toBe(17);
    expect(ageInYears(leap, new Date(2026, 2, 1))).toBe(18);
  });

  it("gives the server one day of slack on UTC calendar dates", () => {
    const now = new Date(Date.UTC(2026, 9, 9, 23));
    const dob = (day: number) => new Date(Date.UTC(2008, 9, day));
    expect(isVolunteerAgeEligibleOnServer(dob(10), now)).toBe(true);
    expect(isVolunteerAgeEligibleOnServer(dob(11), now)).toBe(false);
  });

  it("never rejects on the server a date the form accepts east of UTC", () => {
    // 2008-03-01 picked in IST at 01:00 IST on 2026-03-01.
    const dob = new Date(Date.UTC(2008, 1, 29, 18, 30));
    const now = new Date(Date.UTC(2026, 1, 28, 19, 30));
    expect(isVolunteerAgeEligibleOnServer(dob, now)).toBe(true);
  });

  it("offers dates up to exactly 18 years ago", () => {
    expect(latestVolunteerDob(today)).toEqual(new Date(2008, 9, 9));
  });

  it("offers March 1 when today is a leap day", () => {
    expect(latestVolunteerDob(new Date(2028, 1, 29))).toEqual(
      new Date(2010, 2, 1)
    );
  });
});
