import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

function buildMutateBody(mutationName: string, args: Record<string, unknown>) {
  const suffix = `${mutationName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-unhappy-cg-${suffix}`,
    mutations: [
      {
        args: [args],
        clientID: `e2e-unhappy-${suffix}`,
        id: 1,
        name: mutationName,
        timestamp: Date.now(),
        type: "custom" as const,
      },
    ],
    pushVersion: 1,
    requestID: `e2e-unhappy-req-${suffix}`,
    timestamp: Date.now(),
  };
}

test.describe("Reimbursement unhappy paths (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("super admin can edit an approved reimbursement", async ({ page }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");

    // An approved reimbursement without a payment screenshot, like those
    // approved before the screenshot was required, stays editable.
    await reimbursements.createReimbursement("Unhappy Edit Test");
    await reimbursements.approveInDatabase();

    await expect(reimbursements.detail.getEditSubmissionButton()).toBeVisible();
  });

  test("API: approving without a payment screenshot is rejected", async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");

    await reimbursements.createReimbursement("API Approve No Screenshot");
    await reimbursements.handOverInDatabase();
    const reimbursementId = reimbursements.currentRequestId();

    const body = buildMutateBody("reimbursement.approve", {
      id: reimbursementId,
    });
    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations[0]?.result).toMatchObject({
      error: "app",
      message: "Attach the payment screenshot to approve",
    });
    await expect(reimbursements.detail.getStatusBadge("Pending")).toBeVisible();
  });

  test("API: re-approving an approved reimbursement without a screenshot is rejected", async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");

    await reimbursements.createReimbursement("API Double Approve");
    await reimbursements.handOverInDatabase();
    await reimbursements.approveInDatabase();

    const body = buildMutateBody("reimbursement.approve", {
      id: reimbursements.currentRequestId(),
    });
    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations[0]?.result).toMatchObject({
      error: "app",
      message: "Attach the payment screenshot to approve",
    });
  });
});
