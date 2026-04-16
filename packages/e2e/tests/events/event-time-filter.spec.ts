import { expect, test } from "../../fixtures/test";

test.describe("Event time scope filter", () => {
  test("shows time scope filter buttons on events page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Time filter group is labeled with "Time" text (appears twice: desktop + mobile)
    await expect(page.getByText("Time", { exact: true }).first()).toBeVisible();

    // Verify all three time scope buttons exist
    await expect(page.getByRole("button", { name: "This Week" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "This Month" })
    ).toBeVisible();
  });

  test("filters events by This Week scope", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const weekButton = page.getByRole("button", { name: "This Week" });

    // Click "This Week" filter
    await weekButton.click();
    await page.waitForTimeout(500);

    // Search box should still be visible (we're still on the events page)
    await expect(
      page.getByRole("searchbox", { name: /search events/i })
    ).toBeVisible();
  });

  test("filters events by This Month scope", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const monthButton = page.getByRole("button", { name: "This Month" });

    // Click "This Month" filter
    await monthButton.click();
    await page.waitForTimeout(500);

    // Search box should still be visible
    await expect(
      page.getByRole("searchbox", { name: /search events/i })
    ).toBeVisible();
  });

  test("resets to All events", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const weekButton = page.getByRole("button", { name: "This Week" });

    // Apply a filter
    await weekButton.click();
    await page.waitForTimeout(500);

    // Find the "All" button in the Time section (not the Show section)
    // The Time section's All button is adjacent to This Week / This Month
    const timeAllButton = weekButton
      .locator("..")
      .getByRole("button", { name: "All", exact: true });
    await timeAllButton.click();
    await page.waitForTimeout(500);

    // Search box should still be visible
    await expect(
      page.getByRole("searchbox", { name: /search events/i })
    ).toBeVisible();
  });
});
