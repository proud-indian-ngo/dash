import { describe, expect, it } from "vitest";
import { canManageKalakritiResponsibility } from "./kalakriti";

describe("canManageKalakritiResponsibility", () => {
  it("allows Edition Administrators to manage Edition roles", () => {
    expect(
      canManageKalakritiResponsibility(
        ["edition_admin"],
        "volunteer_coordinator"
      )
    ).toBe(true);
  });

  it("prevents Volunteer Coordinators from appointing administrators", () => {
    expect(
      canManageKalakritiResponsibility(
        ["volunteer_coordinator"],
        "edition_admin"
      )
    ).toBe(false);
    expect(
      canManageKalakritiResponsibility(
        ["volunteer_coordinator"],
        "volunteer_coordinator"
      )
    ).toBe(false);
  });

  it("allows Volunteer Coordinators to assign operational roles", () => {
    expect(
      canManageKalakritiResponsibility(
        ["volunteer_coordinator"],
        "overall_events_lead"
      )
    ).toBe(true);
  });
});
