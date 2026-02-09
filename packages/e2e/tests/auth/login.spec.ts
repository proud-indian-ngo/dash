import path from "node:path";
import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
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
    // Auth error toast should appear
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("forgot password link navigates to /forgot-password", async ({
    page,
  }) => {
    await expect(page.getByText("Forgot password?")).toBeVisible();
    await page.getByText("Forgot password?").click();
    await page.waitForURL("/forgot-password");
  });
});
