import path from "node:path";
import { expect, test } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

test.describe("Register page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
  });

  test("renders all form fields", async ({ page }) => {
    await expect(
      page.getByText("Create your account", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByLabel("Phone")).toBeVisible();
    await expect(page.getByLabel("Date of birth")).toBeVisible();
    await expect(page.getByLabel("Gender")).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
  });

  test("shows validation errors for required fields on empty submit", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Register" }).click();
    await expect(
      page.getByText("Name must be at least 2 characters")
    ).toBeVisible();
    await expect(page.getByText("Invalid email address")).toBeVisible();
    await expect(
      page.getByText("Password must be at least 8 characters")
    ).toBeVisible();
    await expect(page.getByText("Please select a gender")).toBeVisible();
  });

  test("shows password confirmation mismatch error", async ({ page }) => {
    await page.getByLabel("Password", { exact: true }).fill("Password123!");
    await page.getByLabel("Confirm password").fill("DifferentPassword123!");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill("mismatch@example.com");
    // Select gender
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Male" }).click();
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("successful registration redirects to login with success toast", async ({
    page,
  }) => {
    const uniqueEmail = `e2e-register-${Date.now()}@example.com`;
    await page.getByLabel("Name").fill("E2E Test User");
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.getByLabel("Password", { exact: true }).fill("Password123!");
    await page.getByLabel("Confirm password").fill("Password123!");
    // Select gender
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Male" }).click();
    await page.getByRole("button", { name: "Register" }).click();
    await page.waitForURL("/login", { timeout: 15_000 });
    await expect(
      page.locator("[data-sonner-toast]").getByText("Registration successful")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("duplicate email shows error toast", async ({ page }) => {
    await page.getByLabel("Name").fill("Duplicate User");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill("Password123!");
    await page.getByLabel("Confirm password").fill("Password123!");
    // Select gender
    await page.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Female" }).click();
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.locator("[data-sonner-toast]")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("login link navigates to /login", async ({ page }) => {
    await expect(page.getByText("Already have an account?")).toBeVisible();
    await page.getByText("Login").click();
    await page.waitForURL("/login");
  });
});
