import { expect, test } from "../../fixtures/test";
import { AdvancePaymentPage } from "../../pages/advance-payment-page";

test.describe("Advance payment delete", () => {
  let ap: AdvancePaymentPage;

  test.beforeEach(({ page }) => {
    ap = new AdvancePaymentPage(page);
  });

  test("admin deletes an advance payment via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await ap.createAdvancePayment("Delete Admin");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const row = ap.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await ap.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete advance payment")).toBeVisible();
    await expect(
      dialog.getByText("permanently delete this advance payment")
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Advance payment deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("admin can cancel delete dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await ap.createAdvancePayment("Delete Cancel");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const row = ap.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await ap.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("volunteer sees Delete option for own pending advance payment", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    const title = await ap.createAdvancePayment("Delete Vol");

    await ap.navigateToList();
    await ap.list.waitForTableData();

    const row = ap.list.getRowByText(title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await ap.list.openRowActionAndClick(row, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Advance payment deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });
});
