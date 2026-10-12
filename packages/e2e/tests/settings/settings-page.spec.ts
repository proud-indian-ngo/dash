import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

test.describe("Settings page", () => {
  test("opens from the account menu on Profile", async ({ page }) => {
    await page.goto("/");
    await waitForZeroReady(page);

    const sidebar = page.locator("[data-sidebar='sidebar']");
    if (!(await sidebar.isVisible())) {
      await page
        .getByRole("button", { name: "Toggle Sidebar" })
        .first()
        .click();
    }
    await page.getByRole("button", { name: "Account menu" }).click();
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      await page
        .getByRole("dialog", { name: "Account actions" })
        .getByRole("button", { exact: true, name: "Settings" })
        .click();
    } else {
      await page.getByRole("menuitem", { name: "Settings" }).click();
    }

    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Profile" })
    ).toBeVisible();
  });

  test("/settings goes to Profile", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/profile$/);
  });

  test("the nav moves between sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Desktop nav");
    await openSettingsPage(page, "/settings/profile", "Profile");
    const nav = page.getByRole("navigation", { name: "Settings" });

    await nav.getByRole("link", { exact: true, name: "Account" }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Account" })
    ).toBeVisible();

    await nav.getByRole("link", { name: "Notifications" }).click();
    await expect(
      page.getByText("Choose what reaches you, and where.")
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /in-app/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Bank accounts" }).click();
    await expect(
      page.getByRole("heading", { name: "Add a bank account" })
    ).toBeVisible();
  });

  test("admins see the Organization sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await openSettingsPage(page, "/settings/profile", "Profile");
    const nav = page.getByRole("navigation", { name: "Settings" });

    for (const label of [
      "General",
      "Roles",
      "Expense categories",
      "WhatsApp groups",
      "API tokens",
      "Maintenance",
    ]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("volunteers see only their own sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await openSettingsPage(page, "/settings/profile", "Profile");
    const nav = page.getByRole("navigation", { name: "Settings" });

    await expect(nav.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Expense categories" })
    ).toBeHidden();
    await expect(
      nav.getByRole("link", { name: "WhatsApp groups" })
    ).toBeHidden();
  });

  test("volunteers are sent away from Organization pages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/settings/expense-categories");
    await expect(page).not.toHaveURL(/expense-categories/);
  });
});
