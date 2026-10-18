import { describe, expect, it } from "bun:test";

import { seriesCancelScopes } from "./edit-scope-dialog";

describe("seriesCancelScopes", () => {
  const seriesStart = Date.UTC(2026, 9, 3, 4, 30);

  it("offers this and following on a session that hasn't started", () => {
    expect(seriesCancelScopes(seriesStart, "2026-10-24", false)).toEqual([
      "this",
      "following",
      "all",
    ]);
  });

  it("leaves out this and following on a started session", () => {
    expect(seriesCancelScopes(seriesStart, "2026-10-17", true)).toEqual([
      "this",
      "all",
    ]);
  });
});
