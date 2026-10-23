import { expect, test } from "@playwright/test";

test.describe("Forgot password page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/forgot-password");
  });

  test("shows validation error on empty submit", async ({ page }) => {
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Invalid email address")).toBeVisible();
  });

  test("shows success message on valid email", async ({ page }) => {
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText("we've sent a password reset link")
    ).toBeVisible({ timeout: 10_000 });
  });
});
