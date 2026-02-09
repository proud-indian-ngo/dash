import { expect, test } from "../../fixtures/test";

test.describe("User row actions (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    // Search for the volunteer to ensure it's visible (may be paginated)
    const searchBox = page.getByPlaceholder("Search users...");
    await searchBox.fill("test-volunteer");
    // Wait for filtered table data to show the volunteer
    await expect(page.getByText("test-volunteer@pi-dash.test")).toBeVisible({
      timeout: 15_000,
    });
  });

  async function openRowActionMenu(page: import("@playwright/test").Page) {
    // Find the volunteer row and open the action menu.
    // Zero sync may re-render the table, so retry the click if the menu doesn't open.
    const row = page
      .getByRole("row")
      .filter({ hasText: "test-volunteer@pi-dash.test" });
    const trigger = row.getByTestId("user-row-actions");
    const editItem = page.getByRole("menuitem", { name: "Edit" });

    for (let attempt = 0; attempt < 3; attempt++) {
      await trigger.click();
      try {
        await expect(editItem).toBeVisible({ timeout: 3000 });
        return;
      } catch {
        // Menu didn't open — retry click
      }
    }
    // Final attempt with full timeout
    await trigger.click();
    await expect(editItem).toBeVisible();
  }

  async function clickMenuItem(
    page: import("@playwright/test").Page,
    name: string
  ) {
    // Base UI dropdown re-mounts DOM nodes during open animation, causing
    // Playwright's stability check to fail. Use dispatchEvent to bypass.
    const item = page.getByRole("menuitem", { name });
    await expect(item).toBeVisible();
    await item.dispatchEvent("click");
  }

  test("row action menu shows Edit, Reset password, Ban user, Delete", async ({
    page,
  }) => {
    await openRowActionMenu(page);

    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Reset password" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Ban user" })
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  });

  test("Edit opens dialog with pre-populated fields", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Edit");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Edit\s/)).toBeVisible();

    // Should have Name field pre-populated
    await expect(dialog.getByLabel("Name")).toHaveValue(/\S/);
    // No password field in edit mode
    await expect(dialog.getByLabel("Password")).toBeHidden();
  });

  test("Edit cancel closes dialog", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Edit");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Delete opens confirmation alertdialog", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Delete");

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await expect(
      alertDialog.getByRole("heading", { name: "Delete user" })
    ).toBeVisible();
    await expect(
      alertDialog.getByRole("button", { name: "Cancel" })
    ).toBeVisible();
    await expect(
      alertDialog.getByRole("button", { name: "Delete user" })
    ).toBeVisible();
  });

  test("Delete cancel closes confirmation", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Delete");

    const alertDialog = page.getByRole("alertdialog");
    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("Ban user opens dialog with Ban reason", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Ban user");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Ban\s/ })).toBeVisible();
    await expect(dialog.getByLabel("Ban reason")).toBeVisible();
  });

  test("Ban user cancel closes dialog", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Ban user");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Reset password opens dialog", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Reset password");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Reset Password/)).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: /^New password/ })
    ).toBeVisible();
    await expect(
      dialog.getByRole("textbox", { name: /^Confirm new password/ })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Update password" })
    ).toBeVisible();
  });

  test("Reset password cancel closes dialog", async ({ page }) => {
    await openRowActionMenu(page);
    await clickMenuItem(page, "Reset password");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

// --- Destructive action tests using throwaway users ---

test.describe("User destructive actions (admin)", () => {
  async function createThrowawayUser(
    page: import("@playwright/test").Page,
    suffix: string
  ) {
    const uniqueEmail = `e2e-${suffix}-${Date.now()}@pi-dash.test`;
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    await page.getByRole("button", { name: "Create user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name").fill(`Throwaway ${suffix}`);
    await dialog.getByRole("textbox", { name: /^Email/ }).fill(uniqueEmail);
    await dialog.getByLabel("Password").fill("ThrowAway123!");

    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User created")).toBeVisible();

    return uniqueEmail;
  }

  async function openRowActionMenuForUser(
    page: import("@playwright/test").Page,
    email: string
  ) {
    const searchBox = page.getByPlaceholder("Search users...");
    await searchBox.fill(email);
    await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });

    const row = page.getByRole("row").filter({ hasText: email });
    const trigger = row.getByTestId("user-row-actions");
    const editItem = page.getByRole("menuitem", { name: "Edit" });

    for (let attempt = 0; attempt < 3; attempt++) {
      await trigger.click();
      try {
        await expect(editItem).toBeVisible({ timeout: 3000 });
        return;
      } catch {
        // Menu didn't open — retry
      }
    }
    await trigger.click();
    await expect(editItem).toBeVisible();
  }

  async function clickMenuItem(
    page: import("@playwright/test").Page,
    name: string
  ) {
    const item = page.getByRole("menuitem", { name });
    await expect(item).toBeVisible();
    await item.dispatchEvent("click");
  }

  test("edit user saves changes", async ({ page }) => {
    const email = await createThrowawayUser(page, "edit");
    await openRowActionMenuForUser(page, email);
    await clickMenuItem(page, "Edit");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Change name
    await dialog.getByLabel("Name").clear();
    await dialog.getByLabel("Name").fill("Updated Name");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User updated")).toBeVisible();
  });

  test("delete user removes them from the list", async ({ page }) => {
    const email = await createThrowawayUser(page, "delete");
    await openRowActionMenuForUser(page, email);
    await clickMenuItem(page, "Delete");

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog).toBeVisible();
    await alertDialog.getByRole("button", { name: "Delete user" }).click();

    await expect(alertDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User deleted")).toBeVisible();

    // Verify user no longer appears
    await expect(page.getByText(email)).toBeHidden({ timeout: 10_000 });
  });

  test("ban user changes their status", async ({ page }) => {
    const email = await createThrowawayUser(page, "ban");
    await openRowActionMenuForUser(page, email);
    await clickMenuItem(page, "Ban user");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Ban reason").fill("E2E test ban");
    await dialog.getByRole("button", { name: "Ban user" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User banned")).toBeVisible();
  });

  test("reset password updates the password", async ({ page }) => {
    const email = await createThrowawayUser(page, "resetpw");
    await openRowActionMenuForUser(page, email);
    await clickMenuItem(page, "Reset password");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const newPassword = "NewPassword456!";
    await dialog
      .getByRole("textbox", { name: /^New password/ })
      .fill(newPassword);
    await dialog
      .getByRole("textbox", { name: /^Confirm new password/ })
      .fill(newPassword);
    await dialog.getByRole("button", { name: "Update password" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Password updated")).toBeVisible();
  });
});
