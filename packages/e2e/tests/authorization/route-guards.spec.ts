import { expect, test } from "../../fixtures/test";

/**
 * Verifies that role-gated routes redirect users without the required permission
 * back to the dashboard.
 */

async function expectRedirectToDashboard(
  page: import("@playwright/test").Page,
  url: string
) {
  await page.goto(url);
  await page.waitForURL("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.describe("Route guards — volunteer redirects", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("volunteer redirected from /analytics to /", async ({ page }) => {
    await expectRedirectToDashboard(page, "/analytics");
  });

  test("volunteer redirected from /jobs to /", async ({ page }) => {
    await expectRedirectToDashboard(page, "/jobs");
  });

  test("volunteer redirected from /settings/roles to /", async ({ page }) => {
    await expectRedirectToDashboard(page, "/settings/roles");
  });

  test("volunteer redirected from /scheduled-messages to /", async ({
    page,
  }) => {
    await expectRedirectToDashboard(page, "/scheduled-messages");
  });
});

test.describe("Route guards — admin redirects", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("admin redirected from /jobs to /", async ({ page }) => {
    await expectRedirectToDashboard(page, "/jobs");
  });

  test("admin redirected from /settings/roles to /", async ({ page }) => {
    await expectRedirectToDashboard(page, "/settings/roles");
  });
});

test.describe("Route guards — finance_admin redirects", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance-admin only");
  });

  test("finance_admin redirected from /jobs to /", async ({ page }) => {
    await expectRedirectToDashboard(page, "/jobs");
  });

  test("finance_admin redirected from /settings/roles to /", async ({
    page,
  }) => {
    await expectRedirectToDashboard(page, "/settings/roles");
  });
});

test.describe("Route guards — unoriented_volunteer redirects", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );
  });

  test("unoriented_volunteer redirected from /analytics", async ({ page }) => {
    await expectRedirectToDashboard(page, "/analytics");
  });

  test("unoriented_volunteer redirected from /jobs", async ({ page }) => {
    await expectRedirectToDashboard(page, "/jobs");
  });

  test("unoriented_volunteer redirected from /settings/roles", async ({
    page,
  }) => {
    await expectRedirectToDashboard(page, "/settings/roles");
  });

  test("unoriented_volunteer redirected from /scheduled-messages", async ({
    page,
  }) => {
    await expectRedirectToDashboard(page, "/scheduled-messages");
  });
});
