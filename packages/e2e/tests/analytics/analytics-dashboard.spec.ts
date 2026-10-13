import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Analytics dashboard (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/analytics");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders analytics page with heading and stat chips", async ({
    page,
  }) => {
    await expect(page.locator("[data-slot='stat-chip']").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("date range filter is present", async ({ page }) => {
    // DateRangeFilter renders some UI element for range selection
    await expect(
      page
        .getByRole("button", { name: /This year|Last|Range|Custom/i })
        .first()
        .or(page.locator("[data-slot='select-trigger']").first())
    ).toBeVisible({ timeout: 5000 });
  });

  test("spending by programme renders", async ({ page }) => {
    await expect(
      page.getByRole("region", { name: "Spending by programme" })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("chart containers render after data loads", async ({ page }) => {
    await expect(
      page
        .getByRole("region", { name: "Spending by category" })
        .or(page.getByRole("region", { name: "Submission trends" }))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Analytics route guard (volunteer)", () => {
  test("volunteer redirected from /analytics to dashboard", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/analytics");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });
});
