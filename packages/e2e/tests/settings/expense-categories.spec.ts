import { expect, test, waitForZeroReady } from "../../fixtures/test";

async function openExpenseCategories(page: import("@playwright/test").Page) {
  await page.goto("/");
  await waitForZeroReady(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Expense Categories" }).click();
  await expect(
    dialog.getByRole("link", { name: "Expense Categories" })
  ).toBeVisible();
  return dialog;
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
    await expect(dialog.getByText("Add Category")).toBeVisible();

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
      .locator("[class*='border']")
      .filter({ hasText: categoryName });
    await categoryRow.getByRole("button", { name: "Edit category" }).click();
    await expect(dialog.getByText("Edit Category")).toBeVisible();

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
      .locator("[class*='border']")
      .filter({ hasText: categoryName });
    await categoryRow.getByRole("button", { name: "Delete category" }).click();

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
