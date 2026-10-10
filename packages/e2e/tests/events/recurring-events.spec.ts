import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { openAdvancedSettings } from "../../helpers/event-form";
import { openSeededTeam } from "../../helpers/team-event";

/** Seeded public weekly event in "E2E Updates Team". */
const SEEDED_RECURRING = "E2E Upcoming Recurring Public";

test.describe("Recurring events", () => {
  test.slow();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeam(page);
  });

  test("create weekly recurring event and verify occurrences", async ({
    page,
  }) => {
    const eventName = `E2E Recurring Weekly ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await dialog.getByLabel("Location").fill("Weekly Room");

    // Set start time to tomorrow
    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);
    await dialog.getByRole("switch", { name: "Public" }).click();

    // Select weekly recurrence
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    // Verify preview shows upcoming dates
    await expect(dialog.getByText("Next")).toBeVisible({ timeout: 5000 });

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();

    // Table should show multiple occurrences of the same event
    await page.getByPlaceholder("Search events...").fill(eventName);
    const eventCells = page.getByRole("cell").filter({ hasText: eventName });
    await expect(eventCells.first()).toBeVisible({ timeout: 10_000 });

    // Should have more than 1 occurrence (weekly = ~4 in 4-week range)
    const occurrenceCount = await eventCells.count();
    expect(occurrenceCount).toBeGreaterThan(1);

    // All occurrences should show the recurrence label
    const recurrenceBadges = page
      .getByRole("cell")
      .filter({ hasText: /every week/i });
    await expect(recurrenceBadges.first()).toBeVisible();
  });

  test("recurring events appear on the events page", async ({ page }) => {
    await page.goto(`/events?s=${encodeURIComponent(SEEDED_RECURRING)}`);
    await expect(
      page.getByRole("heading", { exact: true, name: "Events" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { exact: true, name: SEEDED_RECURRING }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("recurring event detail shows recurrence info", async ({ page }) => {
    await page.getByPlaceholder("Search events...").fill(SEEDED_RECURRING);
    const recurringRow = page
      .getByRole("row")
      .filter({ hasText: SEEDED_RECURRING })
      .first();
    await recurringRow.getByRole("button").first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByText("Recurrence").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("create monthly recurring event with end condition", async ({
    page,
  }) => {
    const eventName = `E2E Monthly ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);

    // Select monthly recurrence
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Monthly" }).click();

    // Set end condition to "After N occurrences"
    await dialog.getByText("Never").click();
    await page.getByRole("option", { name: "After N occurrences" }).click();

    // Set count to 6
    const countInput = dialog.getByRole("spinbutton").nth(1);
    await countInput.clear();
    await countInput.fill("6");

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();
    await page.getByPlaceholder("Search events...").fill(eventName);
    await expect(
      page.getByRole("cell").filter({ hasText: eventName }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
