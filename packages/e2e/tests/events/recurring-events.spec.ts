import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import {
  openAdvancedSettings,
  waitForToastsToClear,
} from "../../helpers/event-form";
import {
  SANDBOX_TEAM,
  fillTableSearch,
  openSeededTeam,
} from "../../helpers/team-event";
import { ListPage } from "../../pages/list-page";

/** Seeded public weekly event in "E2E Updates Team". */
const SEEDED_RECURRING = "E2E Upcoming Recurring Public";

test.describe("Recurring events", () => {
  test.slow();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeam(page, SANDBOX_TEAM);
  });

  test("create weekly recurring event and verify occurrences", async ({
    page,
  }) => {
    const eventName = `E2E Recurring Weekly ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await dialog.getByLabel("Location").fill("Weekly Room");

    // Set start time to tomorrow
    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start time", tomorrow);
    await dialog.getByRole("switch", { name: "Public" }).click();

    // Select weekly recurrence
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    // Verify preview shows upcoming dates
    await expect(dialog.getByText("Next")).toBeVisible({ timeout: 5000 });

    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();

    // Table should show multiple occurrences of the same event
    await fillTableSearch(page, "Search events...", eventName);
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

    // A later occurrence is virtual: its detail URL carries occDate and the
    // details card shows the series' recurrence.
    await new ListPage(page).openRowActionAndClick(
      page.getByRole("row").filter({ hasText: eventName }).nth(1),
      "View"
    );
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    expect(page.url()).toMatch(/occDate=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByText("Repeats").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("changing the start time refreshes the recurrence preview", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(`E2E Recurrence Preview ${Date.now()}`);

    const first = new Date(Date.now() + 86_400_000);
    const later = new Date(Date.now() + 3 * 86_400_000);
    const day = (date: Date) =>
      `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })} ${date.getFullYear()}`;

    await pickDate(dialog, "Start time", first);
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    const preview = dialog.getByText(/^Next \d+ occurrences$/).locator("..");
    // Each occurrence is its own tag, "17 Oct 2026, 12:00 am"; anchor the
    // match so "1 Oct" never matches "31 Oct".
    const occurrence = (date: Date) =>
      preview.getByText(new RegExp(`^${day(date)},`));
    await expect(occurrence(first)).toBeVisible();

    await pickDate(dialog, "Start time", later);
    await expect(occurrence(later)).toBeVisible();
    await expect(occurrence(first)).toHaveCount(0);
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

  test("create monthly recurring event with end condition", async ({
    page,
  }) => {
    const eventName = `E2E Monthly ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start time", tomorrow);

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

    // Skip the default 3rd Saturday
    const skipOn = dialog.getByText("Skip on", { exact: true }).locator("..");
    await skipOn.getByRole("button", { exact: true, name: "Add" }).click();
    await expect(skipOn.getByText("3rd Saturday")).toBeVisible();

    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();
    await fillTableSearch(page, "Search events...", eventName);
    await expect(
      page.getByRole("cell").filter({ hasText: eventName }).first()
    ).toBeVisible({ timeout: 10_000 });
    // The saved rule keeps the six-occurrence end condition.
    await expect(
      page.getByRole("row").filter({ hasText: eventName }).first()
    ).toContainText("Every month for 6 times");

    await test.step("the server keeps the skipped date pattern", async () => {
      // The series start row edits the series without asking for a scope.
      await waitForToastsToClear(page);
      await new ListPage(page).openRowActionAndClick(
        page.getByRole("row").filter({ hasText: eventName }).first(),
        "Edit"
      );
      await expect(
        dialog.getByRole("heading", { name: "Edit Event" })
      ).toBeVisible();
      await openAdvancedSettings(dialog);
      await expect(
        dialog
          .getByText("Skip on", { exact: true })
          .locator("..")
          .getByText("3rd Saturday")
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    });
  });
});
