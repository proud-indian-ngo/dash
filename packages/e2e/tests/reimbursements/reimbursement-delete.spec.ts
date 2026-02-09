import { expect, test } from "../../fixtures/test";

/**
 * Helper: creates a reimbursement via the form and returns to the list page.
 * Returns the title used so the test can locate the row.
 */
async function createReimbursement(
  page: import("@playwright/test").Page,
  titleSuffix: string
): Promise<string> {
  const title = `E2E Delete ${titleSuffix} ${Date.now()}`;

  await page.goto("/reimbursements/new");
  await expect(
    page.getByRole("heading", { name: "New Reimbursement" })
  ).toBeVisible();

  await page.getByLabel("Title").fill(title);

  await page.getByLabel("City").click();
  await page.getByRole("option", { name: "Bangalore" }).click();

  // Bank account
  const bankAccountGroup = page
    .getByRole("group")
    .filter({ hasText: "Bank Account" });
  await expect(bankAccountGroup.getByRole("combobox")).toBeVisible({
    timeout: 15_000,
  });
  await bankAccountGroup.getByRole("combobox").click();
  await expect(page.getByRole("option")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("option").first().click();

  // Expense Date — pick today
  await page.getByLabel("Expense Date").click();
  const calendar = page.locator('[data-slot="calendar"]');
  await calendar.locator("td.rdp-today button").click();
  await page.getByLabel("Title").click();

  // Line item
  await page.locator('[data-slot="select-value"]:has-text("Category")').click();
  await page.getByRole("option").first().click();
  await page.getByPlaceholder("Description").fill("Delete test item");
  await page.getByPlaceholder("0.00").fill("100");

  await page.getByRole("button", { name: "Submit" }).click();
  await page.waitForURL(/\/reimbursements\/[a-z0-9-]+$/, { timeout: 10_000 });
  await expect(page.getByText("Reimbursement submitted")).toBeVisible();

  return title;
}

/**
 * Opens the actions dropdown on a row. Retries if Zero re-render closes it.
 */
async function openRowActionMenu(
  page: import("@playwright/test").Page,
  row: import("@playwright/test").Locator
) {
  const trigger = row.getByTestId("row-actions");
  const viewItem = page.getByRole("menuitem", { name: "View" });

  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    try {
      await expect(viewItem).toBeVisible({ timeout: 3000 });
      return;
    } catch {
      // Menu didn't open — retry click
    }
  }
  // Final attempt with full timeout
  await trigger.click();
  await expect(viewItem).toBeVisible();
}

/**
 * Clicks a menu item using dispatchEvent to bypass Base UI animation instability.
 */
async function clickMenuItem(
  page: import("@playwright/test").Page,
  name: string
) {
  const item = page.getByRole("menuitem", { name });
  await expect(item).toBeVisible();
  await item.dispatchEvent("click");
}

test.describe("Reimbursement delete", () => {
  test("admin deletes a reimbursement via actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await createReimbursement(page, "Admin");

    // Go to list
    await page.goto("/reimbursements");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    // Find the row we just created
    const row = table.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Open actions menu and click Delete
    await openRowActionMenu(page, row);
    await clickMenuItem(page, "Delete");

    // Confirmation dialog
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete reimbursement")).toBeVisible();
    await expect(
      dialog.getByText("permanently delete this reimbursement")
    ).toBeVisible();

    // Confirm delete
    await dialog.getByRole("button", { name: "Delete" }).click();

    // Toast confirmation
    await expect(page.getByText("Reimbursement deleted")).toBeVisible();

    // Row should be gone
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("admin can cancel delete dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const title = await createReimbursement(page, "Cancel");

    await page.goto("/reimbursements");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const row = table.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await openRowActionMenu(page, row);
    await clickMenuItem(page, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Cancel
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("volunteer sees Delete option for own pending reimbursement", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    const title = await createReimbursement(page, "Vol");

    await page.goto("/reimbursements");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const row = table.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Open actions menu and click Delete
    await openRowActionMenu(page, row);
    await clickMenuItem(page, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Reimbursement deleted")).toBeVisible();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });
});
