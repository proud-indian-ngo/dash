import { describe, expect, it } from "bun:test";

import { formatIndiaTime } from "./notification-delivery";

describe("formatIndiaTime", () => {
  it("shows India time whatever the browser's zone", () => {
    expect(formatIndiaTime(Date.UTC(2026, 9, 19, 4, 10))).toBe(
      "19 Oct 2026, 9:40 am"
    );
  });
});
