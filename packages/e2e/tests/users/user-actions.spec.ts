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
