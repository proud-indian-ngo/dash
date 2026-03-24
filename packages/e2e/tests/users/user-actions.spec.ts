import { expect, test } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("User row actions (admin)", () => {
  let list: ListPage;

  test.beforeEach(async ({ page }) => {
    list = new ListPage(page);
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

  function getVolunteerRow() {
    return list
      .getTable()
      .getByRole("row")
      .filter({ hasText: "test-volunteer@pi-dash.test" });
  }

  test("row action menu shows Edit, Reset password, Ban user, Delete", async ({
    page,
  }) => {
    await list.openRowActionMenu(getVolunteerRow(), "Edit");

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
    await list.openRowActionAndClick(getVolunteerRow(), "Edit");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Edit\s/)).toBeVisible();

    // Should have Name field pre-populated
    await expect(dialog.getByLabel("Name")).toHaveValue(/\S/);
    // No password field in edit mode
    await expect(dialog.getByLabel("Password")).toBeHidden();
  });

  test("Edit cancel closes dialog", async ({ page }) => {
    await list.openRowActionAndClick(getVolunteerRow(), "Edit");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Delete opens confirmation alertdialog", async ({ page }) => {
    await list.openRowActionAndClick(getVolunteerRow(), "Delete");

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
    await list.openRowActionAndClick(getVolunteerRow(), "Delete");

    const alertDialog = page.getByRole("alertdialog");
    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("Ban user opens dialog with Ban reason", async ({ page }) => {
    await list.openRowActionAndClick(getVolunteerRow(), "Ban user");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Ban\s/ })).toBeVisible();
    await expect(dialog.getByLabel("Ban reason")).toBeVisible();
  });

  test("Ban user cancel closes dialog", async ({ page }) => {
    await list.openRowActionAndClick(getVolunteerRow(), "Ban user");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Reset password opens dialog", async ({ page }) => {
    await list.openRowActionAndClick(getVolunteerRow(), "Reset password");

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
    await list.openRowActionAndClick(getVolunteerRow(), "Reset password");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

// --- Destructive action tests using throwaway users ---

test.describe("User destructive actions (admin)", () => {
  let list: ListPage;

  test.beforeEach(({ page }) => {
    list = new ListPage(page);
  });

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
    await dialog.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Male", exact: true }).click();
    // Move focus away from Gender to trigger onBlur validation with the new value
    await dialog.getByLabel("Name").click();
    await expect(
      dialog.getByRole("button", { name: "Create user" })
    ).toBeEnabled({ timeout: 5000 });

    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User created")).toBeVisible();

    return uniqueEmail;
  }

  async function searchAndOpenAction(
    page: import("@playwright/test").Page,
    email: string,
    menuItemName: string
  ) {
    const searchBox = page.getByPlaceholder("Search users...");
    await searchBox.fill(email);
    await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });

    const row = page.getByRole("row").filter({ hasText: email });
    await list.openRowActionAndClick(row, menuItemName);
  }

  test("edit user saves changes", async ({ page }) => {
    const email = await createThrowawayUser(page, "edit");
    await searchAndOpenAction(page, email, "Edit");

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
    await searchAndOpenAction(page, email, "Delete");

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
    await searchAndOpenAction(page, email, "Ban user");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Ban reason").fill("E2E test ban");
    await dialog.getByRole("button", { name: "Ban user" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User banned")).toBeVisible();
  });

  test("reset password updates the password", async ({ page }) => {
    const email = await createThrowawayUser(page, "resetpw");
    await searchAndOpenAction(page, email, "Reset password");

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
