import { describe, expect, it } from "vitest";

import { eventLabel } from "./event-label";

describe("eventLabel", () => {
  it("adds the session date in India time", () => {
    // 18 Oct 2025, 10:00 IST
    expect(eventLabel("Maths class", Date.UTC(2025, 9, 18, 4, 30))).toBe(
      "Maths class (Sat, 18 Oct)"
    );
  });

  it("uses the India date when UTC is still the day before", () => {
    // 19 Oct 2025, 01:00 IST is 18 Oct 19:30 UTC
    expect(eventLabel("Maths class", Date.UTC(2025, 9, 18, 19, 30))).toBe(
      "Maths class (Sun, 19 Oct)"
    );
  });
});
