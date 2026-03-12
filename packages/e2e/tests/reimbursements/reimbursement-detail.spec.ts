import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement detail", () => {
  let reimbursement: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursement = new ReimbursementPage(page);
  });

  test("admin sees Approve/Reject buttons for pending reimbursement", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const pendingRow = reimbursement.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();

    await expect(reimbursement.detail.getApproveButton()).toBeVisible();
    await expect(reimbursement.detail.getRejectButton()).toBeVisible();
  });

  test("volunteer does not see Approve/Reject buttons", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const firstRow = reimbursement.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No reimbursements available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No reimbursement title button");
    await titleButton.click();

    await expect(reimbursement.detail.getApproveButton()).toBeHidden();
    await expect(reimbursement.detail.getRejectButton()).toBeHidden();
  });

  test("admin reject opens alertdialog with reason textarea", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const pendingRow = reimbursement.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();
    await reimbursement.detail.getRejectButton().click();

    const alertDialog = reimbursement.detail.getAlertDialog();
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText("Reject reimbursement?")).toBeVisible();
    await expect(
      alertDialog.getByPlaceholder("Rejection reason...")
    ).toBeVisible();
    await expect(
      alertDialog.getByRole("button", { name: "Cancel" })
    ).toBeVisible();

    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("admin edit submission button opens edit form", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const pendingRow = reimbursement.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();

    await reimbursement.detail.editSubmission();

    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();
    await expect(reimbursement.detail.getViewDetailsButton()).toBeVisible();
    await expect(reimbursement.form.getTitleInput()).toBeVisible();
    await expect(reimbursement.form.getTitleInput()).not.toHaveValue("");
  });

  test("admin approves a pending reimbursement", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.createReimbursement("Approv Flow Test");

    await expect(reimbursement.detail.getApproveButton()).toBeVisible();
    await reimbursement.detail.approve();

    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(reimbursement.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(reimbursement.detail.getApproveButton()).toBeHidden();
    await expect(reimbursement.detail.getRejectButton()).toBeHidden();
  });

  test("admin rejects a pending reimbursement with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.createReimbursement("Denial Flow Test");

    await reimbursement.detail.reject("Not eligible");

    await expect(page.getByText("Reimbursement rejected")).toBeVisible();
    await expect(reimbursement.detail.getStatusBadge("Rejected")).toBeVisible({
      timeout: 10_000,
    });

    await expect(reimbursement.detail.getApproveButton()).toBeHidden();
  });

  test("admin edits submission and saves changes", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const pendingRow = reimbursement.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending reimbursements available");

    await pendingRow.getByTestId("row-title").click();
    await reimbursement.detail.editSubmission();
    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();

    const editedTitle = `Edited ${Date.now()}`;
    await reimbursement.form.getTitleInput().clear();
    await reimbursement.form.fillTitle(editedTitle);

    await reimbursement.form.submit();

    await expect(page.getByText("Reimbursement submitted")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("line items table shows Category, Description, Amount", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const firstRow = reimbursement.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No reimbursements available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No reimbursement title button");
    await titleButton.click();

    await expect(page.getByText("Line items")).toBeVisible();
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
