import { expect, test } from "../../fixtures/test";

test.describe("Vendor payment workflow (admin)", () => {
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
      // Create vendor inline
      await page.keyboard.press("Escape");
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

  test("full payment workflow: approve → record payments → upload invoice → approve invoice", async ({
    page,
  }) => {
    test.slow();
    await createVendorPayment(page, "Full");

    // Step 1: Approve VP
    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);
    await expectStatus(page, "Approved");

    // Step 2: Record partial payment (auto-approved as admin)
    await page.getByRole("button", { name: "Record Payment" }).click();
    const recordDialog = page.getByRole("dialog", { name: /Payment/ });
    await expect(recordDialog).toBeVisible({ timeout: 5000 });
    await recordDialog.getByLabel("Amount").fill("3000");
    await recordDialog.getByLabel("Description").fill("Partial payment");
    await recordDialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(recordDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Partially Paid");

    // Step 3: Record remaining payment
    await page.getByRole("button", { name: "Record Payment" }).click();
    const recordDialog2 = page.getByRole("dialog", { name: /Payment/ });
    await expect(recordDialog2).toBeVisible({ timeout: 5000 });
    await recordDialog2.getByLabel("Amount").fill("2000");
    await recordDialog2.getByLabel("Description").fill("Final payment");
    await recordDialog2.getByRole("button", { name: "Record Payment" }).click();
    await expect(recordDialog2).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Paid");

    // Step 4: Upload invoice
    await page.getByRole("button", { name: "Upload Invoice" }).click();
    const invoiceDialog = page.getByRole("dialog", { name: /Invoice/ });
    await expect(invoiceDialog).toBeVisible({ timeout: 5000 });
    await invoiceDialog.getByLabel("Invoice Number").fill("INV-E2E-001");
    await invoiceDialog.getByLabel("Invoice Date").click();
    await page.getByRole("gridcell", { name: "15" }).first().click();
    await invoiceDialog
      .getByPlaceholder("Paste URL and press Enter")
      .fill("https://example.com/invoice-e2e.pdf");
    await invoiceDialog
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await invoiceDialog.getByRole("button", { name: "Submit Invoice" }).click();
    await expect(invoiceDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");

    // Step 5: Approve invoice
    await page.getByRole("button", { name: "Approve Invoice" }).click();
    await approveInDialog(page);
    await expectStatus(page, "Completed");
  });

  test("invoice rejection and resubmission flow", async ({ page }) => {
    test.slow();
    await createVendorPayment(page, "InvReject");

    // Approve VP
    await page.getByRole("button", { name: "Approve" }).first().click();
    await approveInDialog(page);
    await expectStatus(page, "Approved");

    // Record full payment
    await page.getByRole("button", { name: "Record Payment" }).click();
    const recordDialog = page.getByRole("dialog", { name: /Payment/ });
    await expect(recordDialog).toBeVisible({ timeout: 5000 });
    await recordDialog.getByLabel("Amount").fill("5000");
    await recordDialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(recordDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Paid");

    // Upload invoice
    await page.getByRole("button", { name: "Upload Invoice" }).click();
    const invoiceDialog = page.getByRole("dialog", { name: /Invoice/ });
    await expect(invoiceDialog).toBeVisible({ timeout: 5000 });
    await invoiceDialog.getByLabel("Invoice Number").fill("INV-BAD-001");
    await invoiceDialog.getByLabel("Invoice Date").click();
    await page.getByRole("gridcell", { name: "15" }).first().click();
    await invoiceDialog
      .getByPlaceholder("Paste URL and press Enter")
      .fill("https://example.com/wrong-invoice.pdf");
    await invoiceDialog
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await invoiceDialog.getByRole("button", { name: "Submit Invoice" }).click();
    await expect(invoiceDialog).toBeHidden({ timeout: 10_000 });
    await expectStatus(page, "Invoice Pending");

    // Reject invoice
    await page.getByRole("button", { name: "Reject Invoice" }).click();
    await rejectInDialog(page, "Wrong invoice number format");

    await expectStatus(page, "Paid");
    await expect(
      page.getByText("Wrong invoice number format").first()
    ).toBeVisible();

    // Re-upload corrected invoice
    await page.getByRole("button", { name: "Resubmit Invoice" }).click();
    const editDialog = page.getByRole("dialog", { name: /Invoice/ });
    await expect(editDialog).toBeVisible({ timeout: 5000 });
    await expect(editDialog.getByLabel("Invoice Number")).toHaveValue(
      "INV-BAD-001",
      { timeout: 5000 }
    );
    await editDialog.getByLabel("Invoice Number").clear();
    await editDialog.getByLabel("Invoice Number").fill("INV-GOOD-001");
    await editDialog.getByRole("button", { name: "Submit Invoice" }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
    await expectStatus(page, "Invoice Pending");

    // Approve corrected invoice
    await page.getByRole("button", { name: "Approve Invoice" }).click();
    await approveInDialog(page);
    await expectStatus(page, "Completed");
  });
});

test.describe("Vendor payment workflow (volunteer)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("volunteer can create VP and lands on edit form", async ({ page }) => {
    test.slow();

    const title = `E2E VP Volunteer ${Date.now()}`;
    await page.goto("/vendor-payments/new");
    await expect(
      page.getByRole("heading", { name: "New Vendor Payment" })
    ).toBeVisible();

    await page.getByLabel("Title").fill(title);

    // Select or create a vendor
    await page.getByRole("combobox", { name: "Vendor" }).click();
    const firstOption = page.getByRole("option").first();
    const hasOptions = await firstOption
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (hasOptions) {
      await firstOption.click();
    } else {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Add new vendor" }).click();
      const dialog = page.getByRole("dialog", { name: /vendor/i });
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await dialog
        .getByRole("textbox", { name: "Name", exact: true })
        .fill(`E2E Vendor Vol ${Date.now()}`);
      await dialog
        .getByRole("textbox", { name: "Phone", exact: true })
        .fill("+91-9876543210");
      await dialog
        .getByRole("textbox", { name: "Bank Account Name" })
        .fill("VP Vol Account");
      await dialog
        .getByRole("textbox", { name: "Account Number" })
        .fill("1234567890");
      await dialog
        .getByRole("textbox", { name: "IFSC Code" })
        .fill("SBIN0001234");
      await dialog.getByRole("button", { name: /Create/i }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      await page.getByRole("combobox", { name: "Vendor" }).click();
      await expect(firstOption).toBeVisible({ timeout: 10_000 });
      await firstOption.click();
    }

    // Fill line item
    await page
      .getByRole("combobox", { name: "Category for line item 1" })
      .click();
    await page.getByRole("option").first().click();
    await page.waitForTimeout(300);
    await page.getByLabel("Description for line item 1").fill("Vol line item");
    await page.getByLabel("Amount for line item 1").fill("1000");

    // Submit
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/vendor-payments\/[a-z0-9-]+$/, {
      timeout: 15_000,
    });

    // Volunteer on a pending VP sees the edit form (can still modify before review)
    await expect(
      page.getByRole("heading", { name: "Edit Vendor Payment" })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
      title
    );
  });
});
