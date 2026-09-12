import { describe, expect, it } from "bun:test";

import { selectEntryStudentsForCenter } from "@/lib/kalakriti-entry-policy";

import { createEntrySessionFilterFields } from "./kalakriti-filters";
describe("Entry directory filters", () => {
  it("keeps creation members within the explicitly chosen Center", () => {
    expect(
      selectEntryStudentsForCenter(
        [
          { id: "a", centerId: "a" },
          { id: "b", centerId: "b" },
          { id: "partial" },
        ],
        "b"
      )
    ).toEqual([{ id: "b", centerId: "b" }]);
  });
  it("does not expose Center or arrival filters in the session directory", () => {
    const ids = createEntrySessionFilterFields([]).map((field) => field.id);
    expect(ids).not.toContain("centerNames");
    expect(ids).not.toContain("center");
    expect(ids).not.toContain("arrival");
    expect(ids).not.toContain("present");
    expect(ids).toContain("entryCount");
  });
});
