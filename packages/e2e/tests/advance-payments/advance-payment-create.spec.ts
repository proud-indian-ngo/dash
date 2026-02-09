import { expect, test } from "../../fixtures/test";

test.describe("New advance payment form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/advance-payments/new");
    await expect(
      page.getByRole("heading", { name: "New Advance Payment" })
    ).toBeVisible();
  });

  test("renders form fields (no Expense Date)", async ({ page }) => {
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("City")).toBeVisible();
    // Bank Account renders only after Zero syncs bank account data
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });

    // Advance payments do NOT have Expense Date
    await expect(page.getByLabel("Expense Date")).toBeHidden();
  });

  test("line items section is present", async ({ page }) => {
    await expect(page.getByText("Line items", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Description")).toBeVisible();
  });

  test("add line item button works", async ({ page }) => {
    const addButton = page.getByRole("button", { name: /add line item/i });
    await expect(addButton).toBeVisible();
    await addButton.click();
    const descFields = page.getByPlaceholder("Description");
    await expect(descFields).toHaveCount(2);
  });

  test("submit and cancel buttons are present", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("cancel navigates back to advance payments list", async ({ page }) => {
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL(/\/advance-payments$/);
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    // Click submit without filling anything
    await page.getByRole("button", { name: "Submit" }).click();

    // Should show required field errors via data-slot="field-error"
    const fieldErrors = page.locator('[data-slot="field-error"]');
    await expect(
      fieldErrors.filter({ hasText: "Title is required" })
    ).toBeVisible();
    await expect(
      fieldErrors.filter({ hasText: "City is required" })
    ).toBeVisible();
  });

  test("remove line item button removes a line item", async ({ page }) => {
    // Should start with 1 line item
    await expect(page.getByPlaceholder("Description")).toHaveCount(1);

    // Add a second line item
    await page.getByRole("button", { name: /add line item/i }).click();
    await expect(page.getByPlaceholder("Description")).toHaveCount(2);

    // Remove the second line item
    const removeButtons = page.getByRole("button", { name: /remove/i });
    await removeButtons.last().click();
    await expect(page.getByPlaceholder("Description")).toHaveCount(1);
  });

  test("submits an advance payment successfully", async ({ page }) => {
    // Fill Title
    await page.getByLabel("Title").fill("E2E Test Advance Payment");

    // Select City
    await page.getByLabel("City").click();
    await page.getByRole("option", { name: "Bangalore" }).click();

    // Wait for Zero data (bank accounts) to sync, then select
    const bankAccountGroup = page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
      timeout: 15_000,
    });
    await bankAccountGroup.getByRole("combobox").click();
    await expect(page.getByRole("option")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();

    // Fill line item — Category
    await page
      .locator('[data-slot="select-value"]:has-text("Category")')
      .click();
    await page.getByRole("option").first().click();

    // Fill line item — Description
    await page.getByPlaceholder("Description").fill("Test advance item");

    // Fill line item — Amount
    await page.getByPlaceholder("0.00").fill("1000");

    // Submit
    await page.getByRole("button", { name: "Submit" }).click();

    // Should redirect to the advance payment detail page
    await page.waitForURL(/\/advance-payments\/[a-z0-9-]+$/, {
      timeout: 10_000,
    });

    // Verify success toast
    await expect(page.getByText("Advance payment submitted")).toBeVisible();
  });
});
