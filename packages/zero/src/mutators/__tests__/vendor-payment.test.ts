import { describe, expect, it } from "bun:test";

import { assertVendorUsable } from "../submission-helpers";

describe("vendor validation for payments (assertVendorUsable)", () => {
  it("allows approved vendor for any user", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "other-user", status: "approved" },
        "user-1"
      )
    ).not.toThrow();
  });

  it("allows pending vendor created by the same user", () => {
    expect(() =>
      assertVendorUsable({ createdBy: "user-1", status: "pending" }, "user-1")
    ).not.toThrow();
  });

  it("blocks rejected vendor even if created by the same user", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "user-1", status: "rejected" as "approved" },
        "user-1"
      )
    ).toThrow("Vendor is not available");
  });

  it("blocks pending vendor created by another user", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "other-user", status: "pending" },
        "user-1"
      )
    ).toThrow("Vendor is not available");
  });

  it("allows pending vendor created by another user when bypass is enabled", () => {
    expect(() =>
      assertVendorUsable(
        { createdBy: "other-user", status: "pending" },
        "user-1",
        true
      )
    ).not.toThrow();
  });
});
