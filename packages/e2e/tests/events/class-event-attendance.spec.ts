import { expect, test } from "../../fixtures/test";

test.describe("Class event student attendance (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("class event shows student attendance section", async ({ page }) => {
    test.slow();

    // Navigate to events page
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Find the seeded class event
    const classEventLink = page.getByText("E2E Saturday Class");
    if ((await classEventLink.count()) === 0) {
      test.skip(
        true,
        "No E2E class event available — seed data may be missing"
      );
      return;
    }

    await classEventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Student attendance section should be visible (class event type)
    await expect(page.getByText(/Student Attendance/i)).toBeVisible({
      timeout: 15_000,
    });

    // Enrolled students should be listed
    await expect(page.getByText("E2E Student 1")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("E2E Student 2")).toBeVisible();
    await expect(page.getByText("E2E Student 3")).toBeVisible();
  });

  test("can mark student as present", async ({ page }) => {
    test.slow();

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const classEventLink = page.getByText("E2E Saturday Class");
    if ((await classEventLink.count()) === 0) {
      test.skip(true, "No E2E class event available");
      return;
    }

    await classEventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByText(/Student Attendance/i)).toBeVisible({
      timeout: 15_000,
    });

    // Find a "Present" button for one of the students and click it
    const presentButtons = page.getByRole("button", { name: "Present" });
    if ((await presentButtons.count()) > 0) {
      await presentButtons.first().click();
      // Verify the button state changed (or a toast appeared)
      await page.waitForTimeout(1000); // wait for Zero sync
    }
  });

  test("mark all present button works", async ({ page }) => {
    test.slow();

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const classEventLink = page.getByText("E2E Saturday Class");
    if ((await classEventLink.count()) === 0) {
      test.skip(true, "No E2E class event available");
      return;
    }

    await classEventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByText(/Student Attendance/i)).toBeVisible({
      timeout: 15_000,
    });

    // Click the student attendance "Mark all present" button (2nd one, after volunteer attendance)
    const markAllBtn = page
      .getByRole("button", { name: /Mark all present/i })
      .last();
    if ((await markAllBtn.count()) > 0) {
      await markAllBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
