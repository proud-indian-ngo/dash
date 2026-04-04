import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement detail (reimbursement)", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("admin sees Approve/Reject buttons for pending reimbursement", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const pendingRow = reimbursements.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.click();

    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await expect(reimbursements.detail.getRejectButton()).toBeVisible();
  });

  test("volunteer does not see Approve/Reject buttons", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const firstRow = reimbursements.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No reimbursements available");

    await firstRow.click();

    await expect(reimbursements.detail.getApproveButton()).toBeHidden();
    await expect(reimbursements.detail.getRejectButton()).toBeHidden();
  });

  test("admin approves a pending reimbursement", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.createReimbursement("Approv Flow Test");

    await expect(reimbursements.detail.getApproveButton()).toBeVisible();
    await reimbursements.detail.approve();

    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(reimbursements.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(reimbursements.detail.getApproveButton()).toBeHidden();
    await expect(reimbursements.detail.getRejectButton()).toBeHidden();
  });

  test("admin rejects a pending reimbursement with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.createReimbursement("Denial Flow Test");

    await reimbursements.detail.reject("Not eligible");

    await expect(page.getByText("Reimbursement rejected")).toBeVisible();
    await expect(reimbursements.detail.getStatusBadge("Rejected")).toBeVisible({
      timeout: 10_000,
    });

    await expect(reimbursements.detail.getApproveButton()).toBeHidden();
  });

  test("admin edit submission button opens edit form", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const pendingRow = reimbursements.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.click();

    await reimbursements.detail.editSubmission();

    await expect(page.getByRole("heading", { name: /Edit/ })).toBeVisible();
    await expect(reimbursements.detail.getViewDetailsButton()).toBeVisible();
    await expect(reimbursements.form.getTitleInput()).toBeVisible();
    await expect(reimbursements.form.getTitleInput()).not.toHaveValue("");
  });

  test("admin edits submission and saves changes", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const pendingRow = reimbursements.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.click();
    await reimbursements.detail.editSubmission();
    await expect(page.getByRole("heading", { name: /Edit/ })).toBeVisible();

    const editedTitle = `Edited ${Date.now()}`;
    await reimbursements.form.getTitleInput().clear();
    await reimbursements.form.fillTitle(editedTitle);

    await reimbursements.form.submit();

    await expect(page.getByText("submitted")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("line items table shows Category, Description, Amount", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    // Skip if table is empty
    const emptyMsg = page.getByText("No reimbursements found");
    if (await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "No reimbursements in test DB");
      return;
    }

    // Click first data row (tbody rows, not thead)
    const dataRow = reimbursements.list
      .getTable()
      .locator("tbody")
      .getByRole("row")
      .first();
    await dataRow.click();
    await page.waitForURL(/\/reimbursements\/[a-z0-9-]/, { timeout: 10_000 });

    await expect(page.getByText("Line items")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("columnheader", { name: /Category/ })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Description/ })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /Amount/ })
    ).toBeVisible();
  });
});

// Advance payment creation is disabled in the UI.
test.describe
  .skip("Reimbursement detail (advance_payment)", () => {
    let reimbursements: ReimbursementPage;

    test.beforeEach(({ page }) => {
      reimbursements = new ReimbursementPage(page, "advance_payment");
    });

    test("advance payment detail does not show Expense Date", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "admin", "Admin-only test");

      await reimbursements.createReimbursement("AP Detail NoDate");

      await expect(
        page.getByText("Advance Payment", { exact: true }).first()
      ).toBeVisible();
      await expect(page.getByText("Expense Date")).toBeHidden();
    });

    test("admin approves a pending advance payment", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "admin", "Admin-only test");

      await reimbursements.createReimbursement("AP Approve Flow");

      await expect(reimbursements.detail.getApproveButton()).toBeVisible();
      await reimbursements.detail.approve();

      await expect(page.getByText("Advance payment approved")).toBeVisible();
      await expect(
        reimbursements.detail.getStatusBadge("Approved")
      ).toBeVisible({
        timeout: 10_000,
      });

      await expect(reimbursements.detail.getApproveButton()).toBeHidden();
      await expect(reimbursements.detail.getRejectButton()).toBeHidden();
    });

    test("admin rejects a pending advance payment with reason", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "admin", "Admin-only test");

      await reimbursements.createReimbursement("AP Reject Flow");

      await reimbursements.detail.reject("Budget exceeded");

      await expect(page.getByText("Advance payment rejected")).toBeVisible();
      await expect(
        reimbursements.detail.getStatusBadge("Rejected")
      ).toBeVisible({
        timeout: 10_000,
      });

      await expect(reimbursements.detail.getApproveButton()).toBeHidden();
    });
  });
