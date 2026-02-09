import { expect, test } from "../../fixtures/test";

test.describe("New reimbursement form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reimbursements/new");
    await expect(
      page.getByRole("heading", { name: "New Reimbursement" })
    ).toBeVisible();
  });

  test("renders all form fields", async ({ page }) => {
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("City")).toBeVisible();
    await expect(page.getByLabel("Expense Date")).toBeVisible();
    // Bank Account renders only after Zero syncs bank account data
    await expect(page.getByText("Bank Account")).toBeVisible({
      timeout: 15_000,
    });
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

  test("cancel navigates back to reimbursements list", async ({ page }) => {
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL(/\/reimbursements$/);
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
    await expect(
      fieldErrors.filter({ hasText: "Expense date is required" })
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

  test("submits a reimbursement successfully", async ({ page }) => {
    // Fill Title
    await page.getByLabel("Title").fill("E2E Test Reimbursement");

    // Select City
    await page.getByLabel("City").click();
    await page.getByRole("option", { name: "Bangalore" }).click();

    // Wait for Zero data (bank accounts) to sync, then select BEFORE date picker
    const bankAccountGroup = page
      .getByRole("group")
      .filter({ hasText: "Bank Account" });
    await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
      timeout: 15_000,
    });
    await bankAccountGroup.getByRole("combobox").click();
    await expect(page.getByRole("option")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();

    // Select Expense Date — pick today (do this last to avoid popover interference)
    await page.getByLabel("Expense Date").click();
    const calendar = page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();
    await calendar.locator("td.rdp-today button").click();
    // Close the date picker popover by clicking the title field (outside popover area)
    await page.getByLabel("Title").click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeHidden();

    // Fill line item — Category
    await page
      .locator('[data-slot="select-value"]:has-text("Category")')
      .click();
    await page.getByRole("option").first().click();

    // Fill line item — Description
    await page.getByPlaceholder("Description").fill("Test expense item");

    // Fill line item — Amount
    await page.getByPlaceholder("0.00").fill("500");

    // Submit
    await page.getByRole("button", { name: "Submit" }).click();

    // Should redirect to the reimbursement detail page
    await page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, { timeout: 10_000 });

    // Verify success toast
    await expect(page.getByText("Reimbursement submitted")).toBeVisible();
  });
});
