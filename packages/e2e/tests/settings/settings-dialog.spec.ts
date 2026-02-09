import { expect, test } from "../../fixtures/test";

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByText("Settings").click();

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
    if (testInfo.project.name !== "admin") {
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

  test("notifications section shows WhatsApp toggle", async ({ page }) => {
    await openSettings(page);
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Notifications", { exact: true }).click();
    await expect(dialog.getByText("WhatsApp Notifications")).toBeVisible({
      timeout: 15_000,
    });
  });
});
