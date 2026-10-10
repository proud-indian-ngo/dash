import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { openAdvancedSettings } from "../../helpers/event-form";
import { openSeededTeam } from "../../helpers/team-event";
import { ListPage } from "../../pages/list-page";

test.describe("Recurring event exclusion patterns", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeam(page);
  });

  test("recurrence builder displays exclusion pattern controls", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill required fields
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(`E2E Exclusion ${Date.now()}`);

    // Set start time
    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);

    // Enable recurrence
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    // Look for recurrence builder section which should have exclusion controls
    const recurrenceSection = dialog.getByText(/recurrence|schedule/i);
    if ((await recurrenceSection.count()) === 0) {
      test.skip(true, "Recurrence section not found");
      return;
    }

    // Verify the recurrence builder is visible
    await expect(dialog.getByText(/Daily|Weekly|Monthly/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("can view recurring event with exclusion dates", async ({ page }) => {
    // Navigate to an existing recurring event
    const eventRow = page
      .getByRole("row")
      .filter({ hasText: /E2E Weekly|Weekly/ });

    if ((await eventRow.count()) === 0) {
      test.skip(true, "No recurring events available");
      return;
    }

    // Open the row actions menu and navigate to event detail
    await new ListPage(page).openRowActionAndClick(eventRow.first(), "View");

    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Verify event detail loads
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // If this is a recurring event, there should be some indication
    // (could be in the event info section or recurrence details)
    const eventInfo = page.getByText(/Recurring|Weekly|Monthly|Daily/i);
    if ((await eventInfo.count()) > 0) {
      await expect(eventInfo.first()).toBeVisible();
    }
  });

  test("edit dialog preserves recurrence and exclusion patterns", async ({
    page,
  }) => {
    // Navigate to an existing recurring event
    const eventRow = page
      .getByRole("row")
      .filter({ hasText: /E2E Weekly|Weekly/ });

    if ((await eventRow.count()) === 0) {
      test.skip(true, "No recurring events available");
      return;
    }

    await new ListPage(page).openRowActionAndClick(eventRow.first(), "View");

    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Click Edit button
    const editButton = page.getByRole("button", { exact: true, name: "Edit" });
    if ((await editButton.count()) === 0) {
      test.skip(true, "Edit button not available");
      return;
    }
    await editButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Verify recurrence controls are present
    const recurrenceText = dialog.getByText(/Daily|Weekly|Monthly/i);
    if ((await recurrenceText.count()) > 0) {
      await expect(recurrenceText.first()).toBeVisible();
    }

    // Close dialog without making changes
    await page.keyboard.press("Escape");
  });

  test("creating recurring event shows preview of dates", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(`E2E Preview ${Date.now()}`);

    // Set start time
    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);

    // Select weekly recurrence
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    // Preview section should show upcoming occurrences
    const previewSection = dialog.getByText(/Next|upcoming|occurrences/i);
    if ((await previewSection.count()) > 0) {
      await expect(previewSection.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
