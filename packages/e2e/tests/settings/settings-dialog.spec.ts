import { expect, test, waitForZeroReady } from "../../fixtures/test";

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await waitForZeroReady(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  if (!(await sidebar.isVisible())) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
    await expect(sidebar).toBeVisible();
  }

  const userMenuButton = sidebar.locator("[data-sidebar='menu-button']").last();
  await expect(userMenuButton).toBeVisible();
  await userMenuButton.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
}

test.describe("Settings dialog", () => {
  test("opens from user menu and shows Profile by default", async ({
    page,
  }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Profile" })).toBeVisible();
  });

  test("navigates between sections", async ({ page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "Account" }).click();
    await expect(dialog.getByRole("link", { name: "Account" })).toBeVisible();

    await dialog.getByRole("button", { name: "Notifications" }).click();
    await expect(
      dialog.getByText("Choose which notifications you want to receive.")
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Banking" }).click();
    await expect(dialog.getByRole("link", { name: "Banking" })).toBeVisible();
  });

  test("shows admin-only sections for admin", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "super_admin") {
      test.skip();
    }

    await openSettings(page);
    const dialog = page.getByRole("dialog");

    await expect(
      dialog.getByText("Expense Categories", { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByText("WhatsApp Groups", { exact: true })
    ).toBeVisible();
  });

  test("hides admin-only sections for volunteer", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "volunteer") {
      test.skip();
    }

    await openSettings(page);
    const dialog = page.getByRole("dialog");

    await expect(
      dialog.getByText("Expense Categories", { exact: true })
    ).toBeHidden();
    await expect(
      dialog.getByText("WhatsApp Groups", { exact: true })
    ).toBeHidden();
  });

  test("notifications section shows per-topic toggles", async ({ page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Notifications", { exact: true }).click();
    await expect(
      dialog.getByText("Choose which notifications you want to receive.")
    ).toBeVisible({ timeout: 15_000 });
    // Each topic has an email and WhatsApp toggle
    await expect(
      dialog.getByRole("switch", { name: /WhatsApp/i }).first()
    ).toBeVisible();
  });

  test("mobile shows capitalized active section in header select", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await openSettings(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Settings section")).toContainText(
      "Profile"
    );
  });
});
