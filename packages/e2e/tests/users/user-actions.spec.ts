import type { Locator, Page } from "@playwright/test";
import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("User row actions (admin)", () => {
  test.describe.configure({ mode: "serial" });

  let list: ListPage;

  test.beforeEach(async ({ page }) => {
    list = new ListPage(page);
    await page.goto("/users");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await findVolunteerRow(page);
  });

  async function findVolunteerRow(page: Page) {
    const searchBox = page.getByPlaceholder("Search users...");
    async function tryFind(attempt: number): Promise<void> {
      await searchBox.fill("");
      await list.waitForTableData(30_000);
      await searchBox.fill("test-volunteer");
      const row = getVolunteerRow();
      if (await row.isVisible({ timeout: 15_000 }).catch(() => false)) {
        return;
      }
      await page.reload();
      await waitForZeroReady(page);
      if (attempt < 2) {
        await tryFind(attempt + 1);
      }
    }

    await tryFind(0);
    await searchBox.fill("test-volunteer");
    await expect(getVolunteerRow()).toBeVisible({ timeout: 30_000 });
  }

  function getVolunteerRow() {
    return list
      .getTable()
      .getByRole("row")
      .filter({ hasText: "test-volunteer@pi-dash.test" });
  }

  async function openVolunteerActionAndWaitFor(
    page: Page,
    action: string,
    target: Locator
  ): Promise<void> {
    const tryOpen = async (attempt: number): Promise<void> => {
      await list.openRowActionAndClick(getVolunteerRow(), action);
      if (await target.isVisible({ timeout: 3000 }).catch(() => false)) {
        return;
      }
      await page.keyboard.press("Escape").catch(() => {
        // Ignore stale overlays between retries.
      });
      if (attempt >= 2) {
        await expect(target).toBeVisible({ timeout: 10_000 });
        return;
      }
      await tryOpen(attempt + 1);
    };

    await tryOpen(0);
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
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Edit", dialog);
    await expect(dialog.getByText(/Edit\s/)).toBeVisible();

    // Should have Name field pre-populated
    await expect(dialog.getByLabel("Name")).toHaveValue(/\S/);
    // No password field in edit mode
    await expect(dialog.getByLabel("Password")).toBeHidden();
  });

  test("Edit cancel closes dialog", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Edit", dialog);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Delete opens confirmation alertdialog", async ({ page }) => {
    const alertDialog = page.getByRole("alertdialog");
    await openVolunteerActionAndWaitFor(page, "Delete", alertDialog);
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
    const alertDialog = page.getByRole("alertdialog");
    await openVolunteerActionAndWaitFor(page, "Delete", alertDialog);
    await alertDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(alertDialog).toBeHidden();
  });

  test("Ban user opens dialog with Ban reason", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Ban user", dialog);
    await expect(dialog.getByRole("heading", { name: /Ban\s/ })).toBeVisible();
    await expect(dialog.getByLabel("Ban reason")).toBeVisible();
  });

  test("Ban user cancel closes dialog", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Ban user", dialog);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Reset password opens dialog", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Reset password", dialog);
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
    const dialog = page.getByRole("dialog");
    await openVolunteerActionAndWaitFor(page, "Reset password", dialog);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});
