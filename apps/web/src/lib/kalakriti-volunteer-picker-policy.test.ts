import { describe, expect, it } from "bun:test";

import { canAccessKalakritiVolunteerPicker } from "./kalakriti-volunteer-picker-policy";

describe("canAccessKalakritiVolunteerPicker", () => {
  it("allows global Kalakriti administrators", () => {
    expect(
      canAccessKalakritiVolunteerPicker({
        isAssignedManager: false,
        permissions: ["kalakriti.admin"],
      })
    ).toBe(true);
  });

  it("allows assigned managers without coarse Kalakriti access", () => {
    expect(
      canAccessKalakritiVolunteerPicker({
        isAssignedManager: true,
        permissions: [],
      })
    ).toBe(true);
  });

  it("denies callers who are not administrators or assigned managers", () => {
    expect(
      canAccessKalakritiVolunteerPicker({
        isAssignedManager: false,
        permissions: ["kalakriti.view"],
      })
    ).toBe(false);
  });
});
