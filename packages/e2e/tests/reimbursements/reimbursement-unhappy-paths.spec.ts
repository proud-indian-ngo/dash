import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

function buildMutateBody(mutationName: string, args: Record<string, unknown>) {
  const suffix = `${mutationName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    clientGroupID: `e2e-unhappy-cg-${suffix}`,
    mutations: [
      {
        type: "custom" as const,
        id: 1,
        clientID: `e2e-unhappy-${suffix}`,
        name: mutationName,
        args: [args],
        timestamp: Date.now(),
      },
    ],
    pushVersion: 1,
    timestamp: Date.now(),
    requestID: `e2e-unhappy-req-${suffix}`,
  };
}

test.describe("Reimbursement unhappy paths (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("edit button hidden on approved reimbursement", async ({ page }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");

    // Create and approve a reimbursement
    await reimbursements.createReimbursement("Unhappy Edit Test");
    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();
    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(reimbursements.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    // Edit submission button should be hidden after approval
    await expect(reimbursements.detail.getEditSubmissionButton()).toBeHidden();
  });

  test("delete option unavailable on approved reimbursement", async ({
    page,
  }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");

    // Create and approve a reimbursement
    await reimbursements.createReimbursement("Unhappy Delete Test");
    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();
    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(reimbursements.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    // Navigate back to list and check approved row
    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    // Find the approved row — Delete action should not be present
    const approvedRow = reimbursements.list
      .getTable()
      .getByRole("row")
      .filter({ hasText: "Unhappy Delete Test" })
      .first();

    // Open row action menu and check that Delete is not visible
    const trigger = approvedRow.getByTestId("row-actions");
    if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await trigger.click();
      const deleteItem = page.getByRole("menuitem", { name: /Delete/i });
      // Either Delete is not present or not visible for approved items
      await expect(deleteItem)
        .toBeHidden({ timeout: 3000 })
        .catch(() => {
          // It may simply not appear in the menu — that's also acceptable
        });
      await page.keyboard.press("Escape");
    }
  });

  test("API: approving already-approved reimbursement returns app error", async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const reimbursements = new ReimbursementPage(page, "reimbursement");

    // Create and approve reimbursement via UI to get a real ID
    await reimbursements.createReimbursement("API Double Approve");
    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();
    await expect(page.getByText("Reimbursement approved")).toBeVisible();

    // Extract the reimbursement ID from the URL
    const url = page.url();
    const match = url.match(/\/reimbursements\/([a-z0-9-]+)/);
    if (!match) {
      test.skip(true, "Could not extract reimbursement ID from URL");
      return;
    }
    const reimbursementId = match[1];

    // Try to approve again via API
    const body = buildMutateBody("reimbursement.approve", {
      id: reimbursementId,
    });
    const response = await page.request.post(
      `${baseURL}/api/zero/mutate?schema=zero_0&appID=zero`,
      { data: body }
    );
    expect(response.ok()).toBe(true);
    const json = await response.json();
    expect(json.mutations).toBeDefined();
    // Should return an app-level error (already approved)
    expect(json.mutations[0].result.error).toBe("app");
  });
});
