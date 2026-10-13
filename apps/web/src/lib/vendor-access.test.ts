import { describe, expect, it } from "bun:test";

import { canRevealVendorBank, canViewVendorDetails } from "./vendor-access";

const CREATOR = "user-creator";
const OTHER = "user-other";
const pending = { createdBy: CREATOR, status: "pending" };
const approved = { createdBy: CREATOR, status: "approved" };

describe("canViewVendorDetails", () => {
  it("lets the creator read a pending vendor", () => {
    expect(canViewVendorDetails(["vendors.create"], CREATOR, pending)).toBe(
      true
    );
  });

  it("lets an approver read a pending vendor", () => {
    expect(canViewVendorDetails(["requests.approve"], OTHER, pending)).toBe(
      true
    );
  });

  it("hides a pending vendor from other volunteers", () => {
    expect(
      canViewVendorDetails(
        ["vendors.create", "vendors.view_approved", "requests.record_payment"],
        OTHER,
        pending
      )
    ).toBe(false);
  });

  it("hides a pending vendor whose creator was deleted", () => {
    expect(
      canViewVendorDetails(["vendors.create"], OTHER, {
        createdBy: null,
        status: "pending",
      })
    ).toBe(false);
  });

  it("lets anyone who sees every vendor or edits vendors read any vendor", () => {
    expect(canViewVendorDetails(["vendors.view_all"], OTHER, pending)).toBe(
      true
    );
    expect(canViewVendorDetails(["vendors.edit"], OTHER, pending)).toBe(true);
  });

  it("lets approved-vendor viewers and payment recorders read approved vendors", () => {
    expect(
      canViewVendorDetails(["vendors.view_approved"], OTHER, approved)
    ).toBe(true);
    expect(
      canViewVendorDetails(["requests.record_payment"], OTHER, approved)
    ).toBe(true);
  });

  it("refuses a user without vendor permissions", () => {
    expect(canViewVendorDetails([], OTHER, approved)).toBe(false);
  });
});

describe("canRevealVendorBank", () => {
  it("refuses a volunteer who has not raised a payment to the vendor", () => {
    expect(canRevealVendorBank(["requests.record_payment"], false)).toBe(false);
  });

  it("allows a volunteer who raised a payment to the vendor", () => {
    expect(canRevealVendorBank(["requests.record_payment"], true)).toBe(true);
  });

  it("refuses an own payment without the record-payment permission", () => {
    expect(canRevealVendorBank(["vendors.view_approved"], true)).toBe(false);
  });

  it("allows approvers", () => {
    expect(canRevealVendorBank(["requests.approve"], false)).toBe(true);
  });

  it("allows finance.view_sensitive", () => {
    expect(canRevealVendorBank(["finance.view_sensitive"], false)).toBe(true);
  });

  it("refuses vendor editors who are not finance staff or approvers", () => {
    expect(
      canRevealVendorBank(["vendors.edit", "vendors.view_all"], false)
    ).toBe(false);
  });
});
