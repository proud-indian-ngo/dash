import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

function openExpenseCategories(page: import("@playwright/test").Page) {
  return openSettingsPage(
    page,
    "/settings/expense-categories",
    "Expense categories"
  );
}

test.describe("Expense Categories settings (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("shows seeded expense categories", async ({ page }) => {
    const dialog = await openExpenseCategories(page);

    await expect(dialog.getByText("Travel")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Food")).toBeVisible();
    await expect(dialog.getByText("Accommodation")).toBeVisible();
    await expect(dialog.getByText("Supplies")).toBeVisible();
  });

  test("creates a new expense category", async ({ page }) => {
    const dialog = await openExpenseCategories(page);

    const categoryName = `E2E Category ${Date.now()}`;

    await dialog.getByRole("button", { name: "Add category" }).click();
    await expect(dialog.getByText("New category")).toBeVisible();

    await dialog.getByLabel("Name").fill(categoryName);
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Category created")).toBeVisible();
    await expect(dialog.getByText(categoryName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("edits an expense category", async ({ page }) => {
    test.slow();
    const dialog = await openExpenseCategories(page);

    const categoryName = `E2E Edit Cat ${Date.now()}`;
    const editedName = `${categoryName} Edited`;

    // Create first
    await dialog.getByRole("button", { name: "Add category" }).click();
    await dialog.getByLabel("Name").fill(categoryName);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Category created")).toBeVisible();
    await expect(dialog.getByText(categoryName)).toBeVisible({
      timeout: 10_000,
    });

    // Edit
    const categoryRow = dialog
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: categoryName });
    await categoryRow
      .getByRole("button", { name: `Actions for ${categoryName}` })
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(dialog.getByText("Edit category")).toBeVisible();

    await expect(dialog.getByLabel("Name")).toHaveValue(categoryName, {
      timeout: 5000,
    });
    await dialog.getByLabel("Name").fill(editedName);
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Category updated")).toBeVisible();
    await expect(dialog.getByText(editedName)).toBeVisible({ timeout: 10_000 });
  });

  test("deletes an expense category", async ({ page }) => {
    test.slow();
    const dialog = await openExpenseCategories(page);

    const categoryName = `E2E Del Cat ${Date.now()}`;

    // Create first
    await dialog.getByRole("button", { name: "Add category" }).click();
    await dialog.getByLabel("Name").fill(categoryName);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Category created")).toBeVisible();
    await expect(dialog.getByText(categoryName)).toBeVisible({
      timeout: 10_000,
    });

    // Delete
    const categoryRow = dialog
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: categoryName });
    await categoryRow
      .getByRole("button", { name: `Actions for ${categoryName}` })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Delete category?")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText("Category deleted")).toBeVisible();
    await expect(dialog.getByText(categoryName)).toBeHidden({
      timeout: 10_000,
    });
  });
});
