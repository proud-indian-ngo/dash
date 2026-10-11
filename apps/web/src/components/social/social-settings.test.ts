import { describe, expect, it } from "bun:test";

import { isValidOverride, togglePausedKind } from "./social-settings";

describe("togglePausedKind", () => {
  it("adds and removes a kind in canonical order", () => {
    expect(togglePausedKind("", "impact", true)).toBe("impact");
    expect(togglePausedKind("impact", "schedule", true)).toBe(
      "schedule,impact"
    );
    expect(togglePausedKind("schedule,impact", "impact", false)).toBe(
      "schedule"
    );
  });

  it("keeps the reserved story kind and drops unknown values", () => {
    expect(togglePausedKind("story,bogus", "recap", true)).toBe("recap,story");
    expect(togglePausedKind("recap", "recap", false)).toBe("");
  });
});

describe("isValidOverride", () => {
  it.each([
    ["", true],
    ["3600", true],
    ["12.5", true],
    ["-1", false],
    ["many", false],
  ])("%s → %s", (value, expected) => {
    expect(isValidOverride(value)).toBe(expected);
  });
});
