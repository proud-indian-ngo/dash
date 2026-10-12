import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import {
  SANDBOX_TEAM,
  openPublicEvent,
  openSeededTeam,
  searchTeamEvents,
} from "../../helpers/team-event";

test.describe("Event attendance (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("admin sees attendance section on a started event", async ({ page }) => {
    test.slow();

    await openSeededTeam(page, SANDBOX_TEAM);

    // Create a past event so attendance section appears
    const eventName = `E2E Attendance ${Date.now()}`;
    await page.getByRole("button", { name: "Create event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);

    const yesterday = new Date(Date.now() - 86_400_000);
    await pickDate(createDialog, "Start Time", yesterday);

    await createDialog.getByRole("switch", { name: "Public" }).click();

    await createDialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await searchTeamEvents(page, eventName);
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });

    // Navigate to event detail
    const eventCell = page.getByRole("cell").filter({ hasText: eventName });
    await eventCell.getByRole("button").first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // The Volunteers tab opens first, with its attendance controls
    await expect(page.getByRole("tab", { name: /Volunteers/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("No volunteers to mark attendance for.")
    ).toBeVisible();

    // Verify Updates tab also visible (confirms event has started)
    await expect(page.getByRole("tab", { name: /Updates/ })).toBeVisible();
  });
});

test.describe("Event attendance (volunteer)", () => {
  test("volunteer does not see attendance section", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    // A started public event the volunteer belongs to
    await openPublicEvent(page, "E2E Past Event With Pending Update");

    // Attendance controls should NOT be visible to volunteers
    await expect(
      page.getByRole("button", { name: /Mark all present/ })
    ).not.toBeVisible();
  });
});
