import { expect, test } from "@playwright/test";

test.describe("Forgot password page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/forgot-password");
  });

  test("renders forgot password form", async ({ page }) => {
    await expect(page.getByText("Forgot your password?")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset link" })
    ).toBeVisible();
  });

  test("shows validation error on empty submit", async ({ page }) => {
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Invalid email address")).toBeVisible();
  });

  test("shows success message on valid email", async ({ page }) => {
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText("Check your email for a reset link")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("back to login link works", async ({ page }) => {
    await page.getByText("Back to login").click();
    await page.waitForURL("/login");
  });
});
