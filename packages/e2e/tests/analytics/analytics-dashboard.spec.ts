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

  test("renders analytics page with heading and stats cards", async ({
    page,
  }) => {
    // Stats cards section
    await expect(page.locator("[data-slot='card-title']").first()).toBeVisible({
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

  test("chart containers render after data loads", async ({ page }) => {
    // Charts are lazy-loaded via Suspense; wait for at least one chart container
    // Charts render as SVGs or named containers
    await expect(
      page
        .locator("svg")
        .first()
        .or(
          page
            .getByText(
              /Submission Trends|Category Breakdown|Request Submitters|Top Vendors/i
            )
            .first()
        )
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
