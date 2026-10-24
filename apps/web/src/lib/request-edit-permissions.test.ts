import { describe, expect, it } from "bun:test";

import { canEditRequestSubmission } from "./request-edit-permissions";

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

  it("allows edit_all only while pending", () => {
    const hasPermission = permissions("requests.edit_all");

    expect(
      canEditRequestSubmission(
        { status: "pending", userId: "user-1" },
        "user-2",
        hasPermission
      )
    ).toBe(true);
    for (const status of [
      "approved",
      "partially_paid",
      "paid",
      "rejected",
      "invoice_pending",
      "completed",
    ]) {
      expect(
        canEditRequestSubmission(
          { status, userId: "user-1" },
          "user-2",
          hasPermission
        )
      ).toBe(false);
    }
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
