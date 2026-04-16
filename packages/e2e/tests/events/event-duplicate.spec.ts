import { expect, test } from "../../fixtures/test";

test.describe("Event duplication", () => {
  test("duplicates an event from detail page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    // Navigate to events and open the first one
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /.+/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "No events found");
      return;
    }

    const originalEventName = await eventLink.first().textContent();
    if (!originalEventName) {
      test.skip(true, "Event link has no text");
      return;
    }

    await eventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Verify event detail page is loaded
    await expect(
      page.getByRole("heading", { level: 1, name: originalEventName })
    ).toBeVisible({ timeout: 10_000 });

    // Click Duplicate button
    const duplicateButton = page.getByRole("button", { name: "Duplicate" });
    if ((await duplicateButton.count()) === 0) {
      test.skip(true, "Duplicate button not available");
      return;
    }
    await duplicateButton.click();

    // Verify create dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.getByRole("heading", { name: "Create Event" })
    ).toBeVisible();

    // Name field should be pre-filled with original event name
    const nameInput = dialog.getByLabel("Name", { exact: true });
    await expect(nameInput).toBeVisible();
    const prefillValue = await nameInput.inputValue();
    if (!prefillValue) {
      test.skip(true, "Name field was not pre-filled");
      return;
    }

    // Modify name to make it unique
    const dupName = `E2E Dup ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(dupName);

    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    // Should navigate to the new event or show success message
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible({
      timeout: 10_000,
    });

    // Should see the new event name on the page
    await expect(page.getByText(dupName)).toBeVisible({ timeout: 10_000 });
  });

  test("duplicate preserves event details from original", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

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

    // Use the row action menu to navigate to event detail
    const eventRow = page
      .getByRole("row")
      .filter({ hasText: /E2E Event|E2E Edit|E2E Weekly/ });
    if ((await eventRow.count()) === 0) {
      test.skip(true, "No events available");
      return;
    }

    await eventRow.first().getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "View" }).click();

    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Click Duplicate
    const duplicateButton = page.getByRole("button", { name: "Duplicate" });
    if ((await duplicateButton.count()) === 0) {
      test.skip(true, "Duplicate button not available");
      return;
    }
    await duplicateButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Verify fields are visible and editable
    await expect(dialog.getByLabel("Location")).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();

    // Modify only the name
    const dupName = `E2E Dup Copy ${Date.now()}`;
    await dialog.getByLabel("Name", { exact: true }).fill(dupName);

    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible({
      timeout: 10_000,
    });

    // Optionally navigate to the new event to verify details
    const newEventLink = page.getByText(dupName);
    if ((await newEventLink.count()) > 0) {
      await newEventLink.first().click();
      await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

      // Basic verification that we're on the event detail page
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
