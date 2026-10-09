import { MIN_VOLUNTEER_AGE_MESSAGE } from "@pi-dash/shared/volunteer-age";
import { describe, expect, it } from "vitest";

import { signUpDobError } from "./sign-up-age";

const now = new Date("2026-10-09T12:00:00Z");

describe("signUpDobError", () => {
  it.each([undefined, null, ""])("requires a date of birth (%s)", (dob) => {
    expect(signUpDobError(dob, now)).toBe("Date of birth is required");
  });

  it.each(["garbage", 1_000_000_000_000, {}, "1899-12-31T00:00:00Z"])(
    "rejects an invalid date of birth (%s)",
    (dob) => {
      expect(signUpDobError(dob, now)).toBe("Invalid date of birth");
    }
  );

  it("rejects volunteers under 18", () => {
    expect(signUpDobError("2010-01-01T00:00:00Z", now)).toBe(
      MIN_VOLUNTEER_AGE_MESSAGE
    );
    expect(signUpDobError("2008-10-11T00:00:00Z", now)).toBe(
      MIN_VOLUNTEER_AGE_MESSAGE
    );
  });

  it("accepts volunteers who are 18 or older", () => {
    expect(signUpDobError("2008-10-09T00:00:00Z", now)).toBeNull();
    expect(signUpDobError(new Date("1990-05-20T00:00:00Z"), now)).toBeNull();
  });

  it("accepts an IST March 1 birthday sent as the UTC evening before", () => {
    // Picked 2008-03-01 in IST; signing up at 01:00 IST on the 18th birthday.
    const dob = "2008-02-29T18:30:00.000Z";
    const birthdayIst = new Date("2026-02-28T19:30:00Z");
    expect(signUpDobError(dob, birthdayIst)).toBeNull();
  });
});
