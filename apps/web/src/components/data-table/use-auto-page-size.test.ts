import { describe, expect, it } from "bun:test";

import { fitPageSize } from "./use-auto-page-size";

describe("fitPageSize", () => {
  it("fits whole rows into the available height", () => {
    expect(fitPageSize({ available: 600, minimum: 10, rowHeight: 36 })).toBe(
      16
    );
  });

  it("never drops below the minimum", () => {
    expect(fitPageSize({ available: 120, minimum: 10, rowHeight: 36 })).toBe(
      10
    );
    expect(fitPageSize({ available: -50, minimum: 10, rowHeight: 36 })).toBe(
      10
    );
  });

  it("caps very tall windows", () => {
    expect(fitPageSize({ available: 10_000, minimum: 10, rowHeight: 36 })).toBe(
      100
    );
  });

  it("falls back to the minimum when rows have no height", () => {
    expect(fitPageSize({ available: 600, minimum: 20, rowHeight: 0 })).toBe(20);
  });
});
