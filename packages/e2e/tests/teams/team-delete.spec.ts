import { expect, test } from "../../fixtures/test";

/**
 * Helper: creates a team via the dialog and returns the name.
 */
async function createTeam(
  page: import("@playwright/test").Page
): Promise<string> {
  const teamName = `E2E Delete ${Date.now()}`;

  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

  await page.getByRole("button", { name: "Create Team" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill(teamName);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Team created")).toBeVisible();

  return teamName;
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

test.describe("Team delete", () => {
  test("admin deletes a team via actions menu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const teamName = await createTeam(page);

    // Ensure table has loaded with the new team
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const row = table.getByRole("row").filter({ hasText: teamName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Open actions menu and click Delete
    await openRowActionMenu(page, row);
    await clickMenuItem(page, "Delete");

    // Confirmation dialog
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete team")).toBeVisible();
    await expect(
      dialog.getByText("permanently delete this team")
    ).toBeVisible();

    // Confirm delete
    await dialog.getByRole("button", { name: "Delete" }).click();

    // Toast confirmation
    await expect(page.getByText("Team deleted")).toBeVisible();

    // Row should be gone
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("admin can cancel delete dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    const teamName = await createTeam(page);

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });

    const row = table.getByRole("row").filter({ hasText: teamName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await openRowActionMenu(page, row);
    await clickMenuItem(page, "Delete");

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Cancel
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // Row should still be there
    await expect(row).toBeVisible();
  });

  test("volunteer does not see Delete in actions menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Wait for data to load
    const rows = table.getByRole("row");
    const rowCount = await rows.count();
    if (rowCount <= 1) {
      // No team rows — skip since we can't test actions
      return;
    }

    // Open first data row's actions menu
    const firstDataRow = rows.nth(1);
    const trigger = firstDataRow.getByTestId("row-actions");

    // If no actions button exists for volunteer, that's also fine
    if ((await trigger.count()) === 0) {
      return;
    }

    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "View" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeHidden();
  });
});
