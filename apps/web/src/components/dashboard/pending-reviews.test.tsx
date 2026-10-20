import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { type PendingReviewsProps, PendingReviews } from "./pending-reviews";

const emptyQueues: Omit<PendingReviewsProps, "isLoading" | "permissions"> = {
  advancePayments: [],
  eventInterests: [],
  eventPhotos: [],
  eventUpdates: [],
  reimbursements: [],
  vendorPayments: [],
};

const allPermissions: PendingReviewsProps["permissions"] = {
  canApproveRequests: true,
  canApproveUpdates: true,
  canManageInterest: true,
  canManagePhotos: true,
};

function render(
  permissions: PendingReviewsProps["permissions"],
  isLoading = false
) {
  return renderToStaticMarkup(
    <PendingReviews
      {...emptyQueues}
      isLoading={isLoading}
      permissions={permissions}
    />
  );
}

function queueRowCount(markup: string) {
  return markup.match(/data-slot="review-queue-row"/g)?.length ?? 0;
}

describe("PendingReviews", () => {
  test("keeps every permitted category visible while loading and when empty", () => {
    const loading = render(allPermissions, true);
    const empty = render(allPermissions);

    expect(queueRowCount(loading)).toBe(6);
    expect(queueRowCount(empty)).toBe(6);
    expect(empty.match(/Nothing waiting/g)?.length).toBe(6);

    for (const label of [
      "Reimbursements",
      "Advance payments",
      "Vendor payments",
      "Event photos",
      "Event updates",
      "Interest requests",
    ]) {
      expect(loading).toContain(label);
      expect(empty).toContain(label);
    }
  });

  test("renders only categories granted by permissions", () => {
    const markup = render({
      canApproveRequests: false,
      canApproveUpdates: false,
      canManageInterest: false,
      canManagePhotos: true,
    });

    expect(queueRowCount(markup)).toBe(1);
    expect(markup).toContain("Event photos");
    expect(markup).not.toContain("Reimbursements");
  });

  test("renders no panel without a review permission", () => {
    expect(
      render({
        canApproveRequests: false,
        canApproveUpdates: false,
        canManageInterest: false,
        canManagePhotos: false,
      })
    ).toBe("");
  });
});
