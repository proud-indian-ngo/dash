import { describe, expect, it } from "vitest";
import { canAccessKalakritiVolunteerPicker } from "./kalakriti-volunteer-picker-policy";

describe("canAccessKalakritiVolunteerPicker", () => {
  it("allows global Kalakriti administrators", () => {
    expect(canAccessKalakritiVolunteerPicker(["kalakriti.admin"])).toBe(true);
  });

  it("allows callers with coarse Kalakriti access", () => {
    expect(canAccessKalakritiVolunteerPicker(["kalakriti.view"])).toBe(true);
  });

  it("denies an assigned manager after coarse access is revoked", () => {
    expect(canAccessKalakritiVolunteerPicker([])).toBe(false);
  });
});
