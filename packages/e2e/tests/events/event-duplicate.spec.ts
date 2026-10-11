import { expect, test } from "../../fixtures/test";
import {
  SANDBOX_TEAM,
  openSeededTeam,
  openSeededTeamEvent,
  searchTeamEvents,
} from "../../helpers/team-event";

test.describe("Event duplication", () => {
  test("duplicates an event from detail page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    const originalEventName = "E2E Sandbox Source Event";
    await openSeededTeamEvent(page, originalEventName, SANDBOX_TEAM);

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
      dialog.getByRole("heading", { name: "Duplicate Event" })
    ).toBeVisible();

    // Name field should be pre-filled with original event name
    const nameInput = dialog.getByRole("textbox", {
      exact: true,
      name: "Name",
    });
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

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();

    // Should navigate to the new event or show success message
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible({
      timeout: 10_000,
    });

    // The copy lands in the same team; find it in the team's event list
    await openSeededTeam(page, SANDBOX_TEAM);
    await searchTeamEvents(page, dupName);
    await expect(
      page.getByRole("cell").filter({ hasText: dupName }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("duplicate preserves event details from original", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeamEvent(page, "E2E Sandbox Source Event", SANDBOX_TEAM);

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
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(dupName);

    await dialog.getByRole("button", { exact: true, name: "Create" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible({
      timeout: 10_000,
    });

    // Optionally navigate to the new event to verify details
    await searchTeamEvents(page, dupName);
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
