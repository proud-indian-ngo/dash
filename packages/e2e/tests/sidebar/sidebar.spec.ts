import path from "node:path";
import dotenv from "dotenv";
import { expect, test } from "../../fixtures/test";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the sidebar to load
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("nav links are present", async ({ page }, testInfo) => {
    const nav = page.locator("[data-sidebar='content']");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Reimbursements" })
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Advance Payments" })
    ).toBeVisible();

    if (testInfo.project.name === "admin") {
      await expect(nav.getByRole("link", { name: "Users" })).toBeVisible();
    } else {
      await expect(nav.getByRole("link", { name: "Users" })).toBeHidden();
    }
  });

  test("clicking Reimbursements navigates correctly", async ({ page }) => {
    const nav = page.locator("[data-sidebar='content']");
    await nav.getByRole("link", { name: "Reimbursements" }).click();
    await page.waitForURL(/\/reimbursements/);
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
  });

  test("clicking Advance Payments navigates correctly", async ({ page }) => {
    const nav = page.locator("[data-sidebar='content']");
    await nav.getByRole("link", { name: "Advance Payments" }).click();
    await page.waitForURL(/\/advance-payments/);
    await expect(
      page.getByRole("heading", { name: "Advance Payments" })
    ).toBeVisible();
  });

  test("user menu opens dropdown with Settings, Notifications, Log out", async ({
    page,
  }) => {
    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.locator("[data-sidebar='menu-button']").last().click();

    await expect(page.getByText("Settings")).toBeVisible();
    await expect(page.getByText("Notifications")).toBeVisible();
    await expect(page.getByText("Log out")).toBeVisible();
  });

  test("toggle sidebar button works", async ({ page }) => {
    const trigger = page
      .getByRole("main")
      .getByRole("button", { name: "Toggle Sidebar" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator("[data-state='collapsed']")).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Toggle Sidebar" })
      .click();
    await expect(page.locator("[data-state='expanded']")).toBeVisible();
  });
});

test.describe("Sidebar log out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("log out redirects to /login", async ({ page }) => {
    // Fresh login in isolated context so shared storageState is unaffected
    await page.goto("/login");
    await page
      .getByLabel("Email")
      .fill(process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test");
    await page
      .getByLabel("Password")
      .fill(process.env.ADMIN_PASSWORD ?? "TestAdmin123!");
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    // Wait for user menu button to be fully rendered with user info
    const sidebar = page.locator("[data-sidebar='sidebar']");
    const menuButton = sidebar.locator("[data-sidebar='menu-button']").last();
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    // Wait for dropdown to open, then click Log out
    const logOutItem = page.getByText("Log out");
    await expect(logOutItem).toBeVisible();
    await logOutItem.click();

    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
