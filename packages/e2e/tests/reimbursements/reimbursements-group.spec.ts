import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursements grouped by status", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Approver-only test");
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("groups rows, collapses a group and opens the inline approve dialog", async ({
    page,
  }) => {
    const title = await reimbursements.createReimbursement("Group Approve");
    await reimbursements.handOverInDatabase();

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();
    const statusHeader = page.getByRole("columnheader", { name: "Status" });
    await expect(statusHeader).toBeVisible();
    await page.getByRole("button", { name: "Group by status" }).click();
    await expect(page).toHaveURL(/group=status/);
    // The group header carries the status, so the column hides while grouped.
    await expect(statusHeader).toBeHidden();

    const row = reimbursements.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    const collapsePending = page.getByRole("button", {
      name: "Collapse Pending",
    });
    await collapsePending.click();
    await expect(row).toBeHidden();
    await page.getByRole("button", { name: "Expand Pending" }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Approve ${title}` }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Approve reimbursement?")).toBeVisible();
    const approve = dialog.getByRole("button", { name: "Approve" });
    await expect(approve).toBeDisabled();
    await reimbursements.detail.attachPaymentScreenshot(dialog);
    await expect(approve).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Group by status" }).click();
    await expect(statusHeader).toBeVisible();
  });
});
