import { describe, expect, it } from "bun:test";

import { countUniqueParticipants } from "./competition-config-types";

describe("countUniqueParticipants", () => {
  it("counts distinct students across entries, including group members", () => {
    expect(
      countUniqueParticipants([
        { members: [{ studentId: "a" }, { studentId: "b" }] },
        { members: [{ studentId: "a" }, { studentId: "c" }] },
        { members: [] },
      ])
    ).toBe(3);
  });

  it("treats missing members as zero participants", () => {
    expect(countUniqueParticipants([{}])).toBe(0);
  });
});
