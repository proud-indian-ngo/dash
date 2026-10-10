import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursements grouped by status", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Approver-only test");
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("groups rows, collapses a group and approves a pending row inline", async ({
    page,
  }) => {
    const title = await reimbursements.createReimbursement("Group Approve");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();
    await page.getByRole("button", { name: "Group by status" }).click();
    await expect(page).toHaveURL(/group=status/);

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
    await dialog.getByRole("button", { name: "Approve" }).click();

    await expect(page.getByText("Reimbursement approved")).toBeVisible();
    await expect(
      row.getByRole("button", { name: `Approve ${title}` })
    ).toBeHidden({ timeout: 10_000 });
  });
});
