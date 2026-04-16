import { expect, test } from "../../fixtures/test";

test.describe("Jobs dashboard (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders jobs page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  });

  test("renders stats cards", async ({ page }) => {
    // Stats cards may show 0 but should still render
    await expect(page.locator("[data-slot='card-title']").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("state filter dropdown is present", async ({ page }) => {
    // TableFilterSelect for job state
    await expect(
      page
        .getByRole("combobox", { name: /State/ })
        .or(page.getByRole("button", { name: /State/ }))
        .first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("refresh button is visible", async ({ page }) => {
    // Refresh icon button exists
    const refreshBtn = page.getByRole("button", { name: /Refresh/i });
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Jobs route guard (volunteer)", () => {
  test("volunteer redirected from /jobs to dashboard", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/jobs");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });
});
