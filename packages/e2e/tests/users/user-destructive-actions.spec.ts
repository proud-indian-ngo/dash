import { expect, test } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

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

    await page.getByRole("button", { name: "Add user" }).click();
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
