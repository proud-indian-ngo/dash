import { describe, expect, it } from "bun:test";

import { format } from "date-fns";

import {
  DATE,
  DATE_TIME,
  DATE_TIME_SECONDS,
  DAY_MONTH,
  DAY_MONTH_TIME,
  ISO_DATE,
  TIME,
} from "./date-formats";

// 16 Oct 2026, 9:40:05 pm local time.
const sample = new Date(2026, 9, 16, 21, 40, 5);

describe("date formats", () => {
  it("render one en-IN style everywhere", () => {
    expect(format(sample, DATE)).toBe("16 Oct 2026");
    expect(format(sample, DATE_TIME)).toBe("16 Oct 2026, 9:40 pm");
    expect(format(sample, DATE_TIME_SECONDS)).toBe("16 Oct 2026, 9:40:05 pm");
    expect(format(sample, DAY_MONTH)).toBe("16 Oct");
    expect(format(sample, DAY_MONTH_TIME)).toBe("16 Oct, 9:40 pm");
    expect(format(sample, TIME)).toBe("9:40 pm");
  });

  it("keeps ISO for keys and input values", () => {
    expect(format(sample, ISO_DATE)).toBe("2026-10-16");
  });
});
