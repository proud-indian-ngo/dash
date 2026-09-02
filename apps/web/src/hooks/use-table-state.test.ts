import { describe, expect, it } from "vitest";

import { migrateColumnPinning } from "@/hooks/use-table-state";

describe("migrateColumnPinning", () => {
  it("keeps start/end pinning", () => {
    expect(
      migrateColumnPinning({ end: ["actions"], start: ["select"] })
    ).toEqual({ end: ["actions"], start: ["select"] });
  });

  it("maps legacy left/right localStorage onto start/end", () => {
    expect(
      migrateColumnPinning({ left: ["select"], right: ["actions"] })
    ).toEqual({ end: ["actions"], start: ["select"] });
  });

  it("prefers start/end when both shapes exist", () => {
    expect(
      migrateColumnPinning({
        end: ["actions"],
        left: ["old-select"],
        right: ["old-actions"],
        start: ["select"],
      })
    ).toEqual({ end: ["actions"], start: ["select"] });
  });

  it("defaults missing sides to empty arrays", () => {
    expect(migrateColumnPinning(undefined)).toEqual({ end: [], start: [] });
    expect(migrateColumnPinning({})).toEqual({ end: [], start: [] });
  });
});
