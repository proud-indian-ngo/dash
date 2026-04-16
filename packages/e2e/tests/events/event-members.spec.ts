import { expect, test } from "../../fixtures/test";

test.describe("Event member management (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    const count = await teamLink.count();
    if (count === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("opens event detail sheet when clicking an event row", async ({
    page,
  }) => {
    // Wait for events section to load
    const eventsHeading = page.getByText("Events");
    await expect(eventsHeading).toBeVisible({ timeout: 10_000 });

    // Find an event row (from previous test runs)
    const eventRow = page.getByRole("cell").filter({ hasText: /E2E Event/ });
    const count = await eventRow.count();
    if (count === 0) {
      test.skip(true, "No events available — run event-create tests first");
      return;
    }

    await eventRow.first().click();

    // Event detail sheet should open
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText("Members")).toBeVisible();
  });

  test("can open add member dialog from event detail", async ({ page }) => {
    const eventRow = page.getByRole("cell").filter({ hasText: /E2E Event/ });
    const count = await eventRow.count();
    if (count === 0) {
      test.skip(true, "No events available");
      return;
    }

    await eventRow.first().click();
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Click Add Member button in the sheet
    await sheet.getByRole("button", { name: "Add Member" }).click();

    // A new dialog should appear
    const addDialog = page.getByRole("dialog").filter({
      hasText: "Add Event Member",
    });
    await expect(addDialog).toBeVisible({ timeout: 5000 });
  });
});
