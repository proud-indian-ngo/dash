import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Vendor payment approval (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  async function createVendorPayment(
    page: import("@playwright/test").Page,
    titleSuffix: string
  ): Promise<string> {
    const title = `E2E VP ${titleSuffix} ${Date.now()}`;

    await page.goto("/vendor-payments/new");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "New Vendor Payment" })
    ).toBeVisible();

    // Fill title
    await page.getByLabel("Title").fill(title);

    // Select first available vendor (wait for Zero sync)
    const vendorTrigger = page.getByRole("combobox", { name: "Vendor" });
    await vendorTrigger.click();
    const firstOption = page.getByRole("option").first();
    const hasOptions = await firstOption
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (hasOptions) {
      await firstOption.click();
    } else {
      // Create vendor inline — close the combobox and wait for overlay to dismiss
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-base-ui-inert]")).toBeHidden({
        timeout: 5000,
      });
      await page.getByRole("button", { name: "Add new vendor" }).click();
      const dialog = page.getByRole("dialog", { name: /vendor/i });
      await expect(dialog).toBeVisible({ timeout: 5000 });
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

      // After creating vendor, select it
      await page.getByRole("combobox", { name: "Vendor" }).click();
      await expect(firstOption).toBeVisible({ timeout: 10_000 });
      await firstOption.click();
    }

    // Select category for line item
    await page
      .getByRole("combobox", { name: "Category for line item 1" })
      .click();
    await page.getByRole("option").first().click();
    await page.waitForTimeout(300);

    // Fill line item
    await page.getByLabel("Description for line item 1").fill("Test line item");
    await page.getByLabel("Amount for line item 1").fill("5000");

    // Submit
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/vendor-payments\/[a-z0-9-]+$/, {
      timeout: 15_000,
    });

    return title;
  }

  /** Assert the VP status badge shows the expected text. */
  async function expectStatus(
    page: import("@playwright/test").Page,
    status: string
  ) {
    await expect(
      page.locator('[data-slot="badge"]').getByText(status, { exact: true })
    ).toBeVisible({ timeout: 10_000 });
  }

  /** Click Approve in the approve alertdialog and wait for it to close. */
  async function approveInDialog(page: import("@playwright/test").Page) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("button", { name: "Approve" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  /** Click Reject in the reject alertdialog and wait for it to close. */
  async function rejectInDialog(
    page: import("@playwright/test").Page,
    reason: string
  ) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByRole("textbox", { name: "Reason" }).fill(reason);
    await dialog.getByRole("button", { name: "Reject" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  }

  test("approve a vendor payment request", async ({ page }) => {
    test.slow();
    const title = await createVendorPayment(page, "Approve");

    await expect(page.getByText(title)).toBeVisible();
    await expectStatus(page, "Pending");

    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);

    await expectStatus(page, "Approved");
  });

  test("reject a vendor payment request with reason", async ({ page }) => {
    test.slow();
    const title = await createVendorPayment(page, "Reject");

    await expect(page.getByText(title)).toBeVisible();
    await expectStatus(page, "Pending");

    await page.getByRole("button", { name: "Reject" }).click();
    await rejectInDialog(page, "Budget exceeded");

    await expectStatus(page, "Rejected");
    await expect(page.getByText("Budget exceeded").first()).toBeVisible();
  });
});
