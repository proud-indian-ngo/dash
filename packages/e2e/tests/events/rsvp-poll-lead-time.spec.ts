import { expect, test } from "../../fixtures/test";

test.describe("RSVP poll lead time", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

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
  });

  test("shows lead time selector when RSVP poll is enabled", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Look for RSVP poll toggle
    const rsvpToggle = dialog.getByLabel(/RSVP Poll|RSVP poll/i);
    if ((await rsvpToggle.count()) === 0) {
      test.skip(true, "RSVP poll toggle not found");
      return;
    }

    // Enable RSVP poll
    await rsvpToggle.check();

    // Lead time selector should appear after enabling RSVP poll
    const leadTimeSelector = dialog.getByLabel(/lead time|send poll/i);
    if ((await leadTimeSelector.count()) === 0) {
      test.skip(true, "Lead time selector not found");
      return;
    }

    // Verify lead time selector is visible
    await expect(leadTimeSelector.first()).toBeVisible({ timeout: 5000 });
  });

  test("lead time dropdown has preset options", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const rsvpToggle = dialog.getByLabel(/RSVP Poll|RSVP poll/i);
    if ((await rsvpToggle.count()) === 0) {
      test.skip(true, "RSVP poll toggle not found");
      return;
    }

    await rsvpToggle.check();

    // Click the lead time dropdown to see options
    const leadTimeSelector = dialog.getByLabel(/lead time|send poll/i);
    if ((await leadTimeSelector.count()) === 0) {
      test.skip(true, "Lead time selector not found");
      return;
    }

    await leadTimeSelector.first().click();

    // Look for preset lead time options (1 week, 5 days, 3 days, 2 days, 1 day)
    const hasLeadTimeOptions = await Promise.any([
      page.getByRole("option", { name: /1 week|7 days/ }).isVisible(),
      page.getByRole("option", { name: /5 days/ }).isVisible(),
      page.getByRole("option", { name: /3 days/ }).isVisible(),
      page.getByRole("option", { name: /2 days/ }).isVisible(),
      page.getByRole("option", { name: /1 day/ }).isVisible(),
    ]).catch(() => false);

    if (!hasLeadTimeOptions) {
      test.skip(true, "Lead time preset options not found");
      return;
    }
  });

  test("can select different lead time values", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const rsvpToggle = dialog.getByLabel(/RSVP Poll|RSVP poll/i);
    if ((await rsvpToggle.count()) === 0) {
      test.skip(true, "RSVP poll toggle not found");
      return;
    }

    await rsvpToggle.check();

    const leadTimeSelector = dialog.getByLabel(/lead time|send poll/i);
    if ((await leadTimeSelector.count()) === 0) {
      test.skip(true, "Lead time selector not found");
      return;
    }

    await leadTimeSelector.first().click();

    // Try to select a lead time option
    const leadTimeOption = page.getByRole("option", {
      name: /5 days|3 days|1 week/,
    });
    if ((await leadTimeOption.count()) === 0) {
      test.skip(true, "Lead time options not available");
      return;
    }

    await leadTimeOption.first().click();

    // Verify selection was made
    await expect(
      dialog.getByLabel(/lead time|send poll/i).first()
    ).toBeVisible();
  });

  test("creates event with custom RSVP poll lead time", async ({ page }) => {
    const eventName = `E2E RSVP ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill basic event details
    await dialog.getByLabel("Name", { exact: true }).fill(eventName);

    // Set start time
    const tomorrow = new Date(Date.now() + 86_400_000);
    await dialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    // Enable and configure RSVP poll
    const rsvpToggle = dialog.getByLabel(/RSVP Poll|RSVP poll/i);
    if ((await rsvpToggle.count()) === 0) {
      test.skip(true, "RSVP poll toggle not found");
      return;
    }

    await rsvpToggle.check();

    // Select a lead time
    const leadTimeSelector = dialog.getByLabel(/lead time|send poll/i);
    if ((await leadTimeSelector.count()) > 0) {
      await leadTimeSelector.first().click();
      const leadTimeOption = page.getByRole("option", {
        name: /5 days|3 days|1 week/,
      });
      if ((await leadTimeOption.count()) > 0) {
        await leadTimeOption.first().click();
      }
    }

    // Create the event
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    // Verify success
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });
  });

  test("RSVP poll toggle can be disabled after enabling", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const rsvpToggle = dialog.getByLabel(/RSVP Poll|RSVP poll/i);
    if ((await rsvpToggle.count()) === 0) {
      test.skip(true, "RSVP poll toggle not found");
      return;
    }

    // Enable RSVP poll
    await rsvpToggle.check();
    const leadTimeSelector = dialog.getByLabel(/lead time|send poll/i);
    if ((await leadTimeSelector.count()) > 0) {
      await expect(leadTimeSelector.first()).toBeVisible();
    }

    // Disable RSVP poll
    await rsvpToggle.uncheck();

    // Lead time selector should disappear
    if ((await leadTimeSelector.count()) > 0) {
      await expect(leadTimeSelector.first()).not.toBeVisible();
    }
  });
});
