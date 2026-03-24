import { expect, test } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor management (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/vendors");
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
  });

  test("renders vendor list page with add button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Add vendor" })
    ).toBeVisible();
    await expect(page.getByPlaceholder("Search vendors...")).toBeVisible();
  });

  test("opens add vendor dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add vendor" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Add New Vendor" })
    ).toBeVisible();

    await expect(
      dialog.getByRole("textbox", { name: "Name", exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "Phone", exact: true })
    ).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "Bank Account Name" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "Account Number" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: "IFSC Code" })
    ).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Create button is disabled when required fields are empty", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  test.slow();
  test("creates, edits, and deletes a vendor", async ({ page }) => {
    const vendorName = `E2E Vendor ${Date.now()}`;
    const editedName = `${vendorName} Edited`;

    // Create
    await page.getByRole("button", { name: "Add vendor" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(vendorName);
    await dialog
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("+91-9876543210");
    await dialog
      .getByRole("textbox", { name: "Bank Account Name" })
      .fill("Test Bank Account");
    await dialog
      .getByRole("textbox", { name: "Account Number" })
      .fill("1234567890");
    await dialog
      .getByRole("textbox", { name: "IFSC Code" })
      .fill("SBIN0001234");

    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Vendor created")).toBeVisible();
    await expect(page.getByText(vendorName)).toBeVisible({ timeout: 10_000 });

    // Edit — use dropdown menu (row actions)
    const list = new ListPage(page);
    const row = page.getByRole("row").filter({ hasText: vendorName });
    await list.openRowActionAndClick(row, "Edit");

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await expect(
      editDialog.getByRole("heading", { name: "Edit Vendor" })
    ).toBeVisible();

    await expect(
      editDialog.getByRole("textbox", { name: "Name", exact: true })
    ).toHaveValue(vendorName);
    await editDialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(editedName);
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Vendor updated")).toBeVisible();
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 10_000 });

    // Delete — use dropdown menu (row actions)
    const editedRow = page.getByRole("row").filter({ hasText: editedName });
    await list.openRowActionAndClick(editedRow, "Delete");

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Vendor deleted")).toBeVisible();
  });
});

test.describe("Vendor route access (volunteer)", () => {
  test("redirects non-admin away from /vendors", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/vendors");
    // Should be redirected to home
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
