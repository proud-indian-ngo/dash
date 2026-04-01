import { expect, test } from "../../fixtures/test";

test.describe("Recurring events", () => {
  test.slow();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    const count = await teamLink.count();
    if (count === 0) {
      test.skip(true, "No E2E team available — run team-create tests first");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("create weekly recurring event and verify occurrences", async ({
    page,
  }) => {
    const eventName = `E2E Recurring Weekly ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(eventName);
    await dialog.getByLabel("Location").fill("Weekly Room");

    // Set start time to tomorrow
    const tomorrow = new Date(Date.now() + 86_400_000);
    await dialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));
    await dialog.getByLabel("Public").check();

    // Select weekly recurrence
    await dialog.getByLabel("Recurrence").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    // Verify preview shows upcoming dates
    await expect(dialog.getByText("Next")).toBeVisible({ timeout: 5000 });

    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();

    // Table should show multiple occurrences of the same event
    const eventCells = page.getByRole("cell").filter({ hasText: eventName });
    await expect(eventCells.first()).toBeVisible({ timeout: 10_000 });

    // Should have more than 1 occurrence (weekly = ~4 in 4-week range)
    const occurrenceCount = await eventCells.count();
    expect(occurrenceCount).toBeGreaterThan(1);

    // All occurrences should show the recurrence label
    const recurrenceBadges = page
      .getByRole("cell")
      .filter({ hasText: /every week/ });
    await expect(recurrenceBadges.first()).toBeVisible();
  });

  test("recurring events appear on the events page", async ({ page }) => {
    // Navigate to global events page
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible({
      timeout: 10_000,
    });

    // Table should be visible
    await expect(
      page.getByRole("columnheader", { name: "Event" })
    ).toBeVisible();

    // If we have recurring events from prior tests, they should show
    // multiple occurrences on this page too
    const rows = page.getByRole("row");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(1); // At least header + 1 event
  });

  test("recurring event detail shows recurrence info", async ({ page }) => {
    // Find a recurring event in the table
    const recurringRow = page
      .getByRole("row")
      .filter({ hasText: /every week|every month|every day/ })
      .first();

    const hasRecurring = (await recurringRow.count()) > 0;
    if (!hasRecurring) {
      test.skip(true, "No recurring events available");
      return;
    }

    // Click the event name to navigate to detail
    await recurringRow.getByRole("button").first().click();

    // Detail page should show recurrence info
    await expect(page.getByText("Recurrence")).toBeVisible({ timeout: 10_000 });
  });

  test("create monthly recurring event with end condition", async ({
    page,
  }) => {
    const eventName = `E2E Monthly ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Name", { exact: true }).fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await dialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    // Select monthly recurrence
    await dialog.getByLabel("Recurrence").click();
    await page.getByRole("option", { name: "Monthly" }).click();

    // Set end condition to "After N occurrences"
    await dialog.getByLabel("Ends").click();
    await page.getByRole("option", { name: "After N occurrences" }).click();

    // Set count to 6
    const countInput = dialog.getByRole("spinbutton").nth(1);
    await countInput.clear();
    await countInput.fill("6");

    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });
  });
});
