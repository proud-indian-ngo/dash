import { describe, expect, it } from "vitest";
import {
  canEditRequestSubmission,
  canEditVendorPaymentSubmission,
} from "./request-edit-permissions";

function permissions(...ids: string[]) {
  return (id: string) => ids.includes(id);
}

describe("canEditRequestSubmission", () => {
  it("rejects owner pending edit without edit_own", () => {
    expect(
      canEditRequestSubmission(
        { status: "pending", userId: "user-1" },
        "user-1",
        permissions()
      )
    ).toBe(false);
  });

  it("allows owner pending edit with edit_own", () => {
    expect(
      canEditRequestSubmission(
        { status: "pending", userId: "user-1" },
        "user-1",
        permissions("requests.edit_own")
      )
    ).toBe(true);
  });

  it("allows edit_all only for pending reimbursements and advances", () => {
    const hasPermission = permissions("requests.edit_all");

    expect(
      canEditRequestSubmission(
        { status: "pending", userId: "user-1" },
        "user-2",
        hasPermission
      )
    ).toBe(true);
    expect(
      canEditRequestSubmission(
        { status: "approved", userId: "user-1" },
        "user-2",
        hasPermission
      )
    ).toBe(false);
  });

  it("allows edit_all_statuses regardless of owner or status", () => {
    expect(
      canEditRequestSubmission(
        { status: "approved", userId: "user-1" },
        "user-2",
        permissions("requests.edit_all_statuses")
      )
    ).toBe(true);
  });
});

describe("canEditVendorPaymentSubmission", () => {
  it("rejects owner pending edit without edit_own", () => {
    expect(
      canEditVendorPaymentSubmission(
        { status: "pending", userId: "user-1" },
        "user-1",
        permissions()
      )
    ).toBe(false);
  });

  it("allows owner pending edit with edit_own", () => {
    expect(
      canEditVendorPaymentSubmission(
        { status: "pending", userId: "user-1" },
        "user-1",
        permissions("requests.edit_own")
      )
    ).toBe(true);
  });

  it("allows edit_all when invoice is not locked", () => {
    const hasPermission = permissions("requests.edit_all");

    expect(
      canEditVendorPaymentSubmission(
        { status: "paid", userId: "user-1" },
        "user-2",
        hasPermission
      )
    ).toBe(true);
  });

  it("rejects edit_all when invoice is locked", () => {
    const hasPermission = permissions("requests.edit_all");

    expect(
      canEditVendorPaymentSubmission(
        { status: "invoice_pending", userId: "user-1" },
        "user-2",
        hasPermission
      )
    ).toBe(false);
    expect(
      canEditVendorPaymentSubmission(
        { status: "completed", userId: "user-1" },
        "user-2",
        hasPermission
      )
    ).toBe(false);
  });

  it("allows edit_all_statuses when invoice is locked", () => {
    expect(
      canEditVendorPaymentSubmission(
        { status: "completed", userId: "user-1" },
        "user-2",
        permissions("requests.edit_all_statuses")
      )
    ).toBe(true);
  });
});
