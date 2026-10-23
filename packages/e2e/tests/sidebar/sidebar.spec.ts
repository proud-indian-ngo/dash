import path from "node:path";

import type { Page } from "@playwright/test";
import dotenv from "dotenv";

import { expect, test } from "../../fixtures/test";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

const ROLES_WITH_USERS = new Set(["super_admin", "admin", "finance_admin"]);
const ROLES_WITH_REIMBURSEMENTS = new Set([
  "super_admin",
  "admin",
  "finance_admin",
  "volunteer",
]);

async function openDashboard(page: Page) {
  await page.goto("/");
  // Wait for the sidebar to load
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page);
  });

  test("nav link visibility per role", async ({ isMobile, page }, testInfo) => {
    const role = testInfo.project.name;
    const nav = page.locator("[data-sidebar='content']");
    const expectVisibleWhen = async (name: string, visible: boolean) => {
      const link = nav.getByRole("link", { name });
      await (visible ? expect(link).toBeVisible() : expect(link).toBeHidden());
    };

    await expectVisibleWhen(
      "Reimbursements",
      ROLES_WITH_REIMBURSEMENTS.has(role)
    );
    await expectVisibleWhen("Users", ROLES_WITH_USERS.has(role));
    await expectVisibleWhen("Jobs", role === "super_admin");
    await expectVisibleWhen(
      "Vendors",
      role !== "volunteer" && role !== "unoriented_volunteer"
    );
    // Roles lives in Settings, only for super_admin.
    await expect(nav.getByRole("link", { name: "Roles" })).toBeHidden();
    if (role === "volunteer") {
      await expect(
        nav.getByRole("link", { exact: true, name: "Settings" })
      ).toBeHidden();
    }

    await page.goto("/settings/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "Profile" })
    ).toBeVisible();
    const settingsNav = page.getByRole("navigation", { name: "Settings" });
    test.skip(isMobile, "Phones pick sections from a select");
    const link = settingsNav.getByRole("link", { name: "Roles" });
    if (role === "super_admin") {
      await expect(link).toBeVisible();
    } else {
      await expect(link).toBeHidden();
    }
  });
});

// Role-independent sidebar controls run once.
test.describe("Sidebar controls", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Layout check");
    await openDashboard(page);
  });

  test("user menu opens dropdown with Settings and Log out", async ({
    page,
  }) => {
    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.getByRole("button", { name: "Account menu" }).click();

    await expect(
      page.getByRole("menuitem", { name: "Settings" })
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
    // Notifications live behind the bell only.
    await expect(
      page.getByRole("menuitem", { name: /Notifications/ })
    ).toHaveCount(0);
  });

  test("the bell opens the inbox beside the sidebar", async ({ page }) => {
    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.getByRole("button", { name: /^Notifications/ }).click();

    const inbox = page.getByRole("dialog", { name: "Notifications" });
    await expect(inbox).toBeVisible();
    await expect(inbox.getByText("Inbox", { exact: true })).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    const inboxBox = await inbox.boundingBox();
    expect(inboxBox?.x ?? 0).toBeGreaterThanOrEqual(
      (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0) - 1
    );

    await page.keyboard.press("Escape");
    await expect(inbox).toBeHidden();
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

  test("sidebar rail is keyboard reachable and toggles the sidebar", async ({
    page,
  }) => {
    const rail = page.locator("[data-slot='sidebar-rail']");
    await expect(rail).toBeVisible();

    await rail.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-state='collapsed']")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-state='expanded']")).toBeVisible();
  });
});

test.describe("Sidebar log out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("log out redirects to /login", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Layout check");
    // Fresh login in isolated context so shared storageState is unaffected
    await page.goto("/login");
    await page
      .getByLabel("Email")
      .fill(process.env.SUPER_ADMIN_EMAIL ?? "test-super-admin@pi-dash.test");
    await page
      .getByLabel("Password")
      .fill(process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin123!");
    await page.getByRole("button", { name: "Log in" }).click();
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
