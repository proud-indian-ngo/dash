import { expect, test } from "../../fixtures/test";

/**
 * Verifies that role-gated routes redirect volunteers to the dashboard.
 * These routes require permissions that volunteers don't have.
 */

test.describe("Route guards — volunteer redirects", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("volunteer redirected from /analytics to /", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("volunteer redirected from /jobs to /", async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("volunteer redirected from /settings/roles to /", async ({ page }) => {
    await page.goto("/settings/roles");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("volunteer redirected from /scheduled-messages to /", async ({
    page,
  }) => {
    await page.goto("/scheduled-messages");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });
});
