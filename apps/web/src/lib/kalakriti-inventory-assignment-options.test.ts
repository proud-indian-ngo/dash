import { describe, expect, it } from "bun:test";

import { getInventoryAssignmentOptions } from "./kalakriti-inventory-assignment-options";

const drawing = {
  id: "drawing",
  name: "Drawing",
  retiredAt: null,
  cancelledAt: null,
};

describe("inventory volunteer assignment options", () => {
  it("offers assigned competitions and other roles without duplicate choices", () => {
    expect(
      getInventoryAssignmentOptions([
        {
          responsibility: "competition_volunteer",
          competitionId: "drawing",
          competition: drawing,
        },
        {
          responsibility: "competition_coordinator",
          competitionId: "drawing",
          competition: drawing,
        },
        { responsibility: "logistics_member", competitionId: null },
        { responsibility: "logistics_member", competitionId: null },
      ])
    ).toEqual([
      {
        value: "competition:drawing",
        label: "Drawing",
        competitionId: "drawing",
        responsibility: null,
      },
      {
        value: "role:logistics_member",
        label: "Logistics Member",
        competitionId: null,
        responsibility: "logistics_member",
      },
    ]);
  });
  it("does not offer retired, cancelled, or missing competitions as roles", () => {
    expect(
      getInventoryAssignmentOptions([
        {
          responsibility: "competition_volunteer",
          competitionId: "drawing",
          competition: { ...drawing, retiredAt: 1 },
        },
        {
          responsibility: "competition_volunteer",
          competitionId: "drawing",
          competition: { ...drawing, cancelledAt: 1 },
        },
        { responsibility: "competition_volunteer", competitionId: "missing" },
      ])
    ).toEqual([]);
  });
  it("shows scoped roles as roles and permits an empty assignment list", () => {
    expect(
      getInventoryAssignmentOptions([
        { responsibility: "competition_category_lead", competitionId: null },
      ])[0]?.responsibility
    ).toBe("competition_category_lead");
    expect(getInventoryAssignmentOptions([])).toEqual([]);
  });
});
