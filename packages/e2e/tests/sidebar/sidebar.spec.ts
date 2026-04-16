import path from "node:path";
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

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the sidebar to load
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("Dashboard link is always present", async ({ page }) => {
    const nav = page.locator("[data-sidebar='content']");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
  });

  test("Reimbursements link visibility per role", async ({
    page,
  }, testInfo) => {
    const nav = page.locator("[data-sidebar='content']");
    const link = nav.getByRole("link", { name: "Reimbursements" });
    if (ROLES_WITH_REIMBURSEMENTS.has(testInfo.project.name)) {
      await expect(link).toBeVisible();
    } else {
      await expect(link).toBeHidden();
    }
  });

  test("Users link visibility per role", async ({ page }, testInfo) => {
    const nav = page.locator("[data-sidebar='content']");
    const link = nav.getByRole("link", { name: "Users" });
    if (ROLES_WITH_USERS.has(testInfo.project.name)) {
      await expect(link).toBeVisible();
    } else {
      await expect(link).toBeHidden();
    }
  });

  test("Roles link visible only for super_admin", async ({
    page,
  }, testInfo) => {
    const nav = page.locator("[data-sidebar='content']");
    const link = nav.getByRole("link", { name: "Roles" });
    if (testInfo.project.name === "super_admin") {
      await expect(link).toBeVisible();
    } else {
      await expect(link).toBeHidden();
    }
  });

  test("Jobs link visible only for super_admin", async ({ page }, testInfo) => {
    const nav = page.locator("[data-sidebar='content']");
    const link = nav.getByRole("link", { name: "Jobs" });
    if (testInfo.project.name === "super_admin") {
      await expect(link).toBeVisible();
    } else {
      await expect(link).toBeHidden();
    }
  });

  test("Vendors link hidden for volunteer + unoriented_volunteer", async ({
    page,
  }, testInfo) => {
    const nav = page.locator("[data-sidebar='content']");
    const link = nav.getByRole("link", { name: "Vendors" });
    if (
      testInfo.project.name === "volunteer" ||
      testInfo.project.name === "unoriented_volunteer"
    ) {
      await expect(link).toBeHidden();
    } else {
      await expect(link).toBeVisible();
    }
  });

  test("clicking Reimbursements navigates correctly", async ({
    page,
  }, testInfo) => {
    test.skip(
      !ROLES_WITH_REIMBURSEMENTS.has(testInfo.project.name),
      "Role lacks reimbursements access"
    );
    const nav = page.locator("[data-sidebar='content']");
    await nav.getByRole("link", { name: "Reimbursements" }).click();
    await page.waitForURL(/\/reimbursements/);
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
  });

  test("user menu opens dropdown with Settings, Notifications, Log out", async ({
    page,
  }) => {
    const sidebar = page.locator("[data-sidebar='sidebar']");
    await sidebar.locator("[data-sidebar='menu-button']").last().click();

    await expect(
      page.getByRole("menuitem", { name: "Settings" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Notifications" })
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
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

  test("log out redirects to /login", async ({ page }) => {
    // Fresh login in isolated context so shared storageState is unaffected
    await page.goto("/login");
    await page
      .getByLabel("Email")
      .fill(process.env.SUPER_ADMIN_EMAIL ?? "test-super-admin@pi-dash.test");
    await page
      .getByLabel("Password")
      .fill(process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin123!");
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
