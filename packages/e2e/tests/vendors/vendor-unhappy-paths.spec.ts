import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor unhappy paths (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/vendors");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
  });

  test("create vendor form shows validation errors on empty submit", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Clear any pre-filled fields and try to submit
    // The Create button should be disabled or validation errors shown
    const createBtn = dialog.getByRole("button", { name: "Create" });

    // If create is disabled (preferred pattern), just verify that
    if (await createBtn.isDisabled({ timeout: 1000 }).catch(() => false)) {
      await expect(createBtn).toBeDisabled();
    } else {
      // Otherwise click and check for validation errors
      await createBtn.click();
      const errors = dialog.locator(
        "[data-slot='error'], [class*='error'], [aria-invalid='true']"
      );
      await expect(errors.first()).toBeVisible({ timeout: 3000 });
    }

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("cannot delete vendor with existing payment requests", async ({
    page,
  }) => {
    test.slow();

    // Create a vendor
    const vendorName = `E2E No Delete ${Date.now()}`;
    await page.getByRole("button", { name: "Add vendor" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(vendorName);
    await createDialog
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("+91-9876543210");
    await createDialog
      .getByRole("textbox", { name: "Bank Account Name" })
      .fill("Test Account");
    await createDialog
      .getByRole("textbox", { name: "Account Number" })
      .fill("1234567890");
    await createDialog
      .getByRole("textbox", { name: "IFSC Code" })
      .fill("SBIN0001234");
    await createDialog.getByRole("button", { name: "Create" }).click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Vendor created")).toBeVisible();
    await expect(page.getByText(vendorName)).toBeVisible({ timeout: 10_000 });

    // Create a vendor payment for this vendor
    await page.goto("/vendor-payments/new");
    await waitForZeroReady(page);

    await page.getByLabel("Title").fill(`VP for ${vendorName}`);

    // Select the vendor we just created
    const vendorCombobox = page.getByRole("combobox", { name: "Vendor" });
    await vendorCombobox.click();
    const option = page.getByRole("option").filter({ hasText: vendorName });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();

    // Fill a line item
    await page
      .getByRole("combobox", { name: "Category for line item 1" })
      .click();
    await page.getByRole("option").first().click();
    await page.getByLabel("Description for line item 1").fill("Test item");
    await page.getByLabel("Amount for line item 1").fill("1000");

    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/vendor-payments\/[a-z0-9-]+$/, {
      timeout: 15_000,
    });

    // Now attempt to delete the vendor from the vendors list
    await page.goto("/vendors");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
    await expect(page.getByText(vendorName)).toBeVisible({ timeout: 10_000 });

    const list = new ListPage(page);
    const vendorRow = page.getByRole("row").filter({ hasText: vendorName });
    await list.openRowActionAndClick(vendorRow, "Delete");

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();

    // Should show a generic error toast (onError: toast.error("Failed to delete vendor"))
    // (dialog stays open on error — useConfirmAction only closes on success)
    await expect(page.getByText("Failed to delete vendor")).toBeVisible({
      timeout: 10_000,
    });

    // Vendor should still be in the table
    await expect(page.getByText(vendorName)).toBeVisible({ timeout: 5000 });
  });
});
