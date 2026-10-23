import { expect, test } from "../../fixtures/test";
import { clickPageAction } from "../../helpers/page-header";
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
    await clickPageAction(page, "Duplicate");

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
    await expect(nameInput).toHaveValue(`Copy of ${originalEventName}`);

    // Modify name to make it unique
    const dupName = `E2E Dup ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(dupName);

    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();

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
    await clickPageAction(page, "Duplicate");

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

    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible({
      timeout: 10_000,
    });

    // The copy carries the source event's details
    await openSeededTeamEvent(page, dupName, SANDBOX_TEAM);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(dupName);
    await expect(page.getByText("Sandbox Hall, Bangalore")).toBeVisible();
    await expect(
      page.getByText("Event the duplication specs copy")
    ).toBeVisible();
  });
});
