import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { openAdvancedSettings } from "../../helpers/event-form";
import { openSeededTeam, searchTeamEvents } from "../../helpers/team-event";

/** Seeded team with its own WhatsApp group, which the RSVP poll needs. */
const RSVP_TEAM = "E2E RSVP Team";
const LEAD_PRESETS = [
  "1 week before",
  "5 days before",
  "3 days before",
  "2 days before",
  "1 day before",
];

async function openCreateEvent(page: Page) {
  await page.getByRole("button", { name: "Create Event" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Turns the RSVP poll on; the team's WhatsApp group makes it available. */
async function enableRsvpPoll(dialog: Locator) {
  await openAdvancedSettings(dialog);
  const toggle = dialog.getByRole("switch", {
    name: "Post RSVP poll on WhatsApp",
  });
  await toggle.click();
  await expect(toggle).toBeChecked();
  return toggle;
}

const leadTime = (dialog: Locator) =>
  dialog.getByRole("combobox", { name: "Post poll" });

test.describe("RSVP poll lead time", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await openSeededTeam(page, RSVP_TEAM);
  });

  test("shows lead time selector when RSVP poll is enabled", async ({
    page,
  }) => {
    const dialog = await openCreateEvent(page);
    await openAdvancedSettings(dialog);
    await expect(leadTime(dialog)).toHaveCount(0);

    await enableRsvpPoll(dialog);
    await expect(leadTime(dialog)).toBeVisible();
  });

  test("lead time dropdown has preset options", async ({ page }) => {
    const dialog = await openCreateEvent(page);
    await enableRsvpPoll(dialog);

    await leadTime(dialog).click();
    for (const preset of LEAD_PRESETS) {
      await expect(
        page.getByRole("option", { exact: true, name: preset })
      ).toBeVisible();
    }
  });

  test("can select different lead time values", async ({ page }) => {
    const dialog = await openCreateEvent(page);
    await enableRsvpPoll(dialog);

    await leadTime(dialog).click();
    await page
      .getByRole("option", { exact: true, name: "5 days before" })
      .click();
    await expect(leadTime(dialog)).toContainText("5 days");

    await leadTime(dialog).click();
    await page
      .getByRole("option", { exact: true, name: "1 day before" })
      .click();
    await expect(leadTime(dialog)).toContainText("1 day");
  });

  test("creates event with custom RSVP poll lead time", async ({ page }) => {
    const eventName = `E2E RSVP ${Date.now()}`;
    const dialog = await openCreateEvent(page);

    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await pickDate(dialog, "Start Time", new Date(Date.now() + 86_400_000));

    await enableRsvpPoll(dialog);
    await leadTime(dialog).click();
    await page
      .getByRole("option", { exact: true, name: "3 days before" })
      .click();

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(/^Event created/)).toBeVisible({
      timeout: 10_000,
    });
    await searchTeamEvents(page, eventName);
    await expect(
      page.getByRole("cell").filter({ hasText: eventName }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("RSVP poll toggle can be disabled after enabling", async ({ page }) => {
    const dialog = await openCreateEvent(page);
    const toggle = await enableRsvpPoll(dialog);
    await expect(leadTime(dialog)).toBeVisible();

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(leadTime(dialog)).toHaveCount(0);
  });
});
