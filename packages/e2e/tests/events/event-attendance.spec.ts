import { expect, test } from "../../fixtures/test";

test.describe("Event attendance (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("admin sees attendance section on a started event", async ({ page }) => {
    test.slow();

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Create a past event so attendance section appears
    const eventName = `E2E Attendance ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(eventName);

    const yesterday = new Date(Date.now() - 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(yesterday.toISOString().slice(0, 16));

    await createDialog.getByLabel("Public").check();

    await createDialog
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });

    // Navigate to event detail
    const eventCell = page.getByRole("cell").filter({ hasText: eventName });
    await eventCell.getByRole("button").first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Attendance section should be visible
    await expect(page.getByText(/Attendance \(\d+\/\d+ present\)/)).toBeVisible(
      { timeout: 10_000 }
    );

    // With 0 members the button is hidden, so just verify the heading is there
    await expect(
      page.getByRole("heading", { name: /Attendance/ })
    ).toBeVisible();

    // Verify Updates tab also visible (confirms event has started)
    await expect(page.getByRole("tab", { name: /Updates/ })).toBeVisible();
  });
});

test.describe("Event attendance (volunteer)", () => {
  test("volunteer does not see attendance section", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    // Find a public event (any started E2E event)
    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /E2E Attendance|E2E Past/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "No started public events found");
      return;
    }

    await eventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Attendance section should NOT be visible to volunteers
    await expect(
      page.getByRole("heading", { name: /Attendance/ })
    ).not.toBeVisible();
  });
});
