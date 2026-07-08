import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await openLoginPage(page);
  });

  test("renders login form", async ({ page }) => {
    await expect(
      page.getByText("Login to your account", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByText("Invalid email address")).toBeVisible();
  });

  test("shows error toast for invalid credentials", async ({ page }) => {
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByLabel("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: "Login" }).click();
    // Auth error is shown inline
    await expect(page.getByRole("alert")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await loginToDashboard(
      page,
      process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test",
      process.env.ADMIN_PASSWORD ?? "TestAdmin123!"
    );
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("forgot password link navigates to /forgot-password", async ({
    page,
  }) => {
    const forgotPasswordLink = page.getByRole("link", {
      name: "Forgot password?",
    });
    await expect(forgotPasswordLink).toBeVisible();
    await forgotPasswordLink.click();
    await page.waitForURL("/forgot-password");
  });
});

async function openLoginPage(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/login");
    if (
      await page
        .getByLabel("Email")
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    ) {
      return;
    }

    if (attempt === 2) {
      await expect(page.getByLabel("Email")).toBeVisible();
      return;
    }
  }
}

async function loginToDashboard(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Login" }).click();

    if (
      await page
        .waitForURL("/", { timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      return;
    }

    if (attempt < 2) {
      await openLoginPage(page);
    }
  }

  await page.waitForURL("/", { timeout: 10_000 });
}
