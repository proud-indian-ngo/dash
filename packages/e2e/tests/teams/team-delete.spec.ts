import { expect, test } from "../../fixtures/test";
import { createTeamViaDialog } from "../../helpers/team";

/**
 * Helper: creates a team via the dialog and returns the name.
 */
async function createTeam(
  page: import("@playwright/test").Page
): Promise<string> {
  const teamName = `E2E Delete ${Date.now()}`;

  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

  return createTeamViaDialog(page, { prefix: teamName });
}

/**
 * Opens the actions dropdown on a row and clicks a menu item atomically.
 * Retries the full sequence if Zero re-render closes the menu.
 */
async function openRowActionAndClick(
  page: import("@playwright/test").Page,
  row: import("@playwright/test").Locator,
  menuItemName: string
) {
  const trigger = row.getByTestId("row-actions");
  const menuItem = page.getByRole("menuitem", { name: menuItemName });

  const tryClick = async (attempt: number): Promise<boolean> => {
    await trigger.click();
    try {
      await expect(menuItem).toBeVisible({ timeout: 3000 });
      await menuItem.click();
      return true;
    } catch {
      // Menu didn't open or item disappeared — dismiss and retry
      await page.keyboard.press("Escape");
      if (attempt >= 2) {
        return false;
      }
      return tryClick(attempt + 1);
    }
  };
  if (await tryClick(0)) {
    return;
  }
  // Final attempt — let it fail with a clear error
  await trigger.click();
  await menuItem.click();
}

test.describe("Team delete", () => {
  test("admin deletes a team via actions menu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const teamName = await createTeam(page);

    // Ensure table has loaded with the new team
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });
    await page.getByPlaceholder("Search teams...").fill(teamName);

    const row = table.getByRole("row").filter({ hasText: teamName });
    await expect(row).toBeVisible({ timeout: 45_000 });

    // Open actions menu and click Delete
    await openRowActionAndClick(page, row, "Delete");

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
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const teamName = await createTeam(page);

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });
    await page.getByPlaceholder("Search teams...").fill(teamName);

    const row = table.getByRole("row").filter({ hasText: teamName });
    await expect(row).toBeVisible({ timeout: 45_000 });

    await openRowActionAndClick(page, row, "Delete");

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
