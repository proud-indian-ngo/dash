import { expect, test } from "../../fixtures/test";

test.describe("Vendor payment approval workflow (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  async function createVendorPayment(
    page: import("@playwright/test").Page,
    titleSuffix: string
  ): Promise<string> {
    const title = `E2E VP ${titleSuffix} ${Date.now()}`;

    await page.goto("/vendor-payments/new");
    await expect(
      page.getByRole("heading", { name: "New Vendor Payment" })
    ).toBeVisible();

    // Fill title
    await page.getByLabel("Title").fill(title);

    // Check if vendors exist in the dropdown
    const vendorTrigger = page.getByLabel("Vendor");
    await vendorTrigger.click();
    const hasOptions = await page
      .getByRole("option")
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasOptions) {
      await page.getByRole("option").first().click();
    } else {
      // Close dropdown and create a vendor inline via the "+" button
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Add new vendor" }).click();

      // Wait for vendor dialog to appear
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Fill vendor form
      await dialog
        .getByRole("textbox", { name: "Name", exact: true })
        .fill(`E2E Vendor ${Date.now()}`);
      await dialog
        .getByRole("textbox", { name: "Phone", exact: true })
        .fill("+91-9876543210");
      await dialog
        .getByRole("textbox", { name: "Bank Account Name" })
        .fill("VP Test Account");
      await dialog
        .getByRole("textbox", { name: "Account Number" })
        .fill("1234567890");
      await dialog
        .getByRole("textbox", { name: "IFSC Code" })
        .fill("SBIN0001234");

      await dialog.getByRole("button", { name: /Create/i }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    }

    // Fill invoice date
    await page.getByLabel("Invoice Date").click();
    const today = page.getByRole("button", { current: "date" });
    await today.click();

    // Select category for line item
    const categorySelect = page
      .getByRole("combobox")
      .filter({ hasText: "Select" })
      .first();
    if (await categorySelect.isVisible().catch(() => false)) {
      await categorySelect.click();
      await page.getByRole("option").first().click();
    }

    // Fill line item
    await page
      .getByRole("textbox", { name: "Description" })
      .first()
      .fill("Vendor payment test item");
    await page.getByRole("textbox", { name: "Amount" }).first().fill("1000");

    // Submit
    await page.getByRole("button", { name: "Submit" }).click();

    await page.waitForURL(/\/vendor-payments\/[a-z0-9-]+$/, {
      timeout: 15_000,
    });

    return title;
  }

  test.fixme("approve a vendor payment request", async ({ page }) => {
    test.slow();
    const title = await createVendorPayment(page, "Approve");

    // Verify on detail page
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();

    // Approve
    await page.getByRole("button", { name: "Approve" }).click();
    const confirmButton = page.getByRole("button", { name: "Confirm" });
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    await expect(page.getByText("Approved")).toBeVisible({ timeout: 10_000 });
  });

  test.fixme("reject a vendor payment request with reason", async ({
    page,
  }) => {
    test.slow();
    const title = await createVendorPayment(page, "Reject");

    // Verify on detail page
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();

    // Reject
    await page.getByRole("button", { name: "Reject" }).click();

    const reasonInput = page.getByLabel("Reason");
    if (await reasonInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reasonInput.fill("Invoice amount exceeds approved budget");
    }

    const rejectConfirm = page.getByRole("button", { name: /Reject/i }).last();
    await rejectConfirm.click();

    await expect(page.getByText("Rejected")).toBeVisible({ timeout: 10_000 });
  });
});
