import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { openAdvancedSettings } from "../../helpers/event-form";
import {
  SANDBOX_TEAM,
  openSeededTeam,
  searchTeamEvents,
} from "../../helpers/team-event";

test.describe("Create event (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeam(page, SANDBOX_TEAM);
  });

  test("opens create event dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create Event" })
    ).toBeVisible();

    await expect(
      dialog.getByRole("textbox", { exact: true, name: "Name" })
    ).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();
    await expect(dialog.getByLabel("Location")).toBeVisible();
    await expect(dialog.getByLabel("Start Time")).toBeVisible();
    await expect(dialog.getByLabel("End Time")).toBeVisible();
    await expect(dialog.getByRole("switch", { name: "Public" })).toBeVisible();
    await openAdvancedSettings(dialog);
    await expect(dialog.getByText("Recurrence").first()).toBeVisible();
  });

  test("Create with an empty name shows the name error", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");

    await expect(
      dialog.getByRole("textbox", { exact: true, name: "Name" })
    ).toHaveValue("");
    await dialog.getByRole("button", { exact: true, name: "Create" }).click();
    await expect(dialog.getByText("Name is required")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("creates a one-time event successfully", async ({ page }) => {
    const eventName = `E2E Event ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await dialog.getByLabel("Location").fill("Test Location");

    // Set start time to tomorrow
    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();
    await searchTeamEvents(page, eventName);
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });
  });

  test("creates a weekly recurring event successfully", async ({ page }) => {
    const eventName = `E2E Weekly ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);

    // Select weekly recurrence from the builder
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();

    // Recurring event should show multiple occurrences in the table
    await searchTeamEvents(page, eventName);
    await expect(page.getByText(eventName).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("recurrence builder shows preview of upcoming dates", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill("Preview Test");

    // Set start time so preview can calculate dates
    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(dialog, "Start Time", tomorrow);

    // Select daily recurrence
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Daily" }).click();

    // Preview section should show upcoming dates
    await expect(dialog.getByText("Next")).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("occurrences")).toBeVisible();
  });

  test("table shows Recurrence column", async ({ page }) => {
    await expect(page.getByText("Recurrence")).toBeVisible();
  });

  test("mobile drawer scrolls to form actions", async ({ page }) => {
    await page.setViewportSize({ height: 932, width: 430 });

    await page.getByRole("button", { name: "Create Event" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const createButton = dialog.getByRole("button", {
      exact: true,
      name: "Create",
    });

    await expect(createButton).not.toBeInViewport();

    await dialog.hover();
    await page.mouse.wheel(0, 1600);

    await expect(createButton).toBeInViewport();
  });
});
