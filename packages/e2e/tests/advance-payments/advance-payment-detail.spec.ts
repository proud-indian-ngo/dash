import { expect, test } from "../../fixtures/test";
import { AdvancePaymentPage } from "../../pages/advance-payment-page";

test.describe("Advance payment detail", () => {
  let ap: AdvancePaymentPage;

  test.beforeEach(({ page }) => {
    ap = new AdvancePaymentPage(page);
  });

  /**
   * Smoke test — depends on seed data. Skips gracefully if no pending rows exist.
   * Non-critical: the approve/reject tests below create their own data.
   */
  test("admin sees Approve/Reject buttons for pending advance payment", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const pendingRow = ap.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending advance payments available");

    await pendingRow.getByTestId("row-title").click();

    await expect(ap.detail.getApproveButton()).toBeVisible();
    await expect(ap.detail.getRejectButton()).toBeVisible();
  });

  /**
   * Smoke test — depends on seed data. Skips gracefully if no rows exist.
   */
  test("volunteer does not see Approve/Reject buttons", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const firstRow = ap.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No advance payments available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No advance payment title button");
    await titleButton.click();

    await expect(ap.detail.getApproveButton()).toBeHidden();
    await expect(ap.detail.getRejectButton()).toBeHidden();
  });

  /**
   * Smoke test — depends on seed data. Skips gracefully if no pending rows exist.
   */
  test("admin reject opens alertdialog with reason textarea", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const pendingRow = ap.list.getPendingRow();
    const hasPending = (await pendingRow.count()) > 0;
    test.skip(!hasPending, "No pending advance payments available");

    await pendingRow.getByTestId("row-title").click();
    await ap.detail.getRejectButton().click();

    const alertDialog = ap.detail.getAlertDialog();
    await expect(alertDialog).toBeVisible();
    await expect(
      alertDialog.getByPlaceholder("Rejection reason...")
    ).toBeVisible();
    await expect(
      alertDialog.getByRole("button", { name: "Cancel" })
    ).toBeVisible();

    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("admin approves a pending advance payment", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.createAdvancePayment("Approv AP Flow");

    await expect(ap.detail.getApproveButton()).toBeVisible();
    await ap.detail.approve();

    await expect(page.getByText("Advance payment approved")).toBeVisible();
    await expect(ap.detail.getStatusBadge("Approved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(ap.detail.getApproveButton()).toBeHidden();
    await expect(ap.detail.getRejectButton()).toBeHidden();
  });

  test("admin rejects a pending advance payment with reason", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.createAdvancePayment("Denial AP Flow");

    await ap.detail.reject("Budget exceeded");

    await expect(page.getByText("Advance payment rejected")).toBeVisible();
    await expect(ap.detail.getStatusBadge("Rejected")).toBeVisible({
      timeout: 10_000,
    });

    await expect(ap.detail.getApproveButton()).toBeHidden();
  });

  test("admin edits submission and saves changes", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.createAdvancePayment("Edit AP Flow");

    await ap.detail.editSubmission();
    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();

    const editedTitle = `Edited ${Date.now()}`;
    await ap.form.getTitleInput().clear();
    await ap.form.fillTitle(editedTitle);

    await ap.form.submit();

    await expect(page.getByText("Advance payment submitted")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin edit submission button opens edit form", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.createAdvancePayment("EditForm AP Flow");

    await ap.detail.editSubmission();

    await expect(
      page.getByRole("heading", { name: "Edit Submission" })
    ).toBeVisible();
    await expect(ap.detail.getViewDetailsButton()).toBeVisible();
    await expect(ap.form.getTitleInput()).toBeVisible();
    await expect(ap.form.getTitleInput()).not.toHaveValue("");
    await expect(page.getByLabel("Expense Date")).toBeHidden();
  });

  /**
   * Smoke test — depends on seed data. Skips gracefully if no rows exist.
   */
  test("attachments section shows Preview/Download links", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const firstRow = ap.list.getRows().nth(1);
    const hasRows = (await firstRow.count()) > 0;
    test.skip(!hasRows, "No advance payments available");

    const titleButton = firstRow.getByTestId("row-title");
    const hasTitle = (await titleButton.count()) > 0;
    test.skip(!hasTitle, "No advance payment title button");
    await titleButton.click();

    const attachmentsHeading = page.getByText("Attachments");
    if ((await attachmentsHeading.count()) > 0) {
      await expect(page.getByText("Preview").first()).toBeVisible();
      await expect(page.getByText("Download").first()).toBeVisible();
    }
  });
});
