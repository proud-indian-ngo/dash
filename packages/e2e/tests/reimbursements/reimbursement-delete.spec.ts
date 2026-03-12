import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement delete", () => {
  let reimbursement: ReimbursementPage;

  test.beforeEach(({ page }) => {
    reimbursement = new ReimbursementPage(page);
  });

  test("admin deletes a reimbursement via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await reimbursement.createReimbursement("Delete Admin");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const row = reimbursement.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursement.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete reimbursement")).toBeVisible();
    await expect(
      dialog.getByText("permanently delete this reimbursement")
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("admin can cancel delete dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await reimbursement.createReimbursement("Delete Cancel");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const row = reimbursement.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursement.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("volunteer sees Delete option for own pending reimbursement", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    const title = await reimbursement.createReimbursement("Delete Vol");

    await reimbursement.navigateToList();
    await reimbursement.list.waitForTableData();

    const row = reimbursement.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await reimbursement.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });
});
