import { expect, test } from "@playwright/test";

test.describe("Reset password page (unauthenticated)", () => {
  test("redirects to forgot-password when no token or error in query", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await page.waitForURL("/forgot-password", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Forgot your password?" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("shows error message when error param is present", async ({ page }) => {
    await page.goto("/reset-password?error=Invalid+or+expired+link");
    await expect(page.getByText("Invalid or expired link")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("link", { name: /Request a new reset link/i })
    ).toBeVisible();
  });

  test("shows reset form fields when token param is present", async ({
    page,
  }) => {
    // A token param causes the reset form to render (even if token is invalid on submit)
    await page.goto("/reset-password?token=test-token-placeholder");
    // The ResetPasswordForm should render with password fields
    await expect(
      page
        .getByRole("textbox", { name: /New password|Password/i })
        .first()
        .or(page.locator("input[type='password']").first())
    ).toBeVisible({ timeout: 10_000 });
  });
});
