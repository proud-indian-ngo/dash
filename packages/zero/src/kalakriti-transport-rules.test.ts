import { describe, expect, it } from "vitest";

import { everyActiveCenterHasTransportAssignment } from "./kalakriti-transport-rules";

describe("everyActiveCenterHasTransportAssignment", () => {
  it("requires at least one assignment per active Center", () => {
    expect(
      everyActiveCenterHasTransportAssignment(
        [
          { id: "center-1", retiredAt: null },
          { id: "center-2", retiredAt: null },
        ],
        [
          { centerId: "center-1", deletedAt: null },
          { centerId: "center-2", deletedAt: null },
        ]
      )
    ).toBe(true);
  });

  it("ignores soft-deleted assignments", () => {
    expect(
      everyActiveCenterHasTransportAssignment(
        [{ id: "center-1", retiredAt: null }],
        [{ centerId: "center-1", deletedAt: 123 }]
      )
    ).toBe(false);
  });

  it("ignores retired Centers", () => {
    expect(
      everyActiveCenterHasTransportAssignment(
        [
          { id: "center-1", retiredAt: null },
          { id: "center-2", retiredAt: 1 },
        ],
        [{ centerId: "center-1", deletedAt: null }]
      )
    ).toBe(true);
  });

  it("fails when an active Center has no assignment", () => {
    expect(
      everyActiveCenterHasTransportAssignment(
        [
          { id: "center-1", retiredAt: null },
          { id: "center-2", retiredAt: null },
        ],
        [{ centerId: "center-1", deletedAt: null }]
      )
    ).toBe(false);
  });

  it("fails when there are no active Centers", () => {
    expect(
      everyActiveCenterHasTransportAssignment(
        [{ id: "center-1", retiredAt: 1 }],
        [{ centerId: "center-1", deletedAt: null }]
      )
    ).toBe(false);
  });
});
