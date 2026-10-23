import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement delete (reimbursement)", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("admin deletes a reimbursement via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const title = await reimbursements.createReimbursement("Delete Admin");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const row = reimbursements.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Cancel first: the dialog closes and the row stays.
    await reimbursements.list.openRowActionAndClick(row, "Delete");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();

    await reimbursements.list.openRowActionAndClick(row, "Delete");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Delete reimbursement" })
    ).toBeVisible();
    await expect(
      dialog.getByText("permanently delete this reimbursement")
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("volunteer sees Delete option for own pending reimbursement", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    const title = await reimbursements.createReimbursement("Delete Vol");

    await reimbursements.navigateToList();
    await reimbursements.list.waitForTableData();

    const row = reimbursements.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursements.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("volunteer cannot delete own approved reimbursement", async ({
    page: _page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    test.slow();

    const title = await reimbursements.createReimbursement("Delete Approved");
    await reimbursements.approveInDatabase();

    await reimbursements.navigateToList();
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(title);
    const row = reimbursements.list.getRowByText(title);
    await expect(row).toHaveCount(1);

    await reimbursements.list.openRowActionMenu(row);
    await expect(reimbursements.list.menuItem("Delete")).toBeDisabled();
  });
});
