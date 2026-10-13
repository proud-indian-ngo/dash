import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { waitForToastsToClear } from "../../helpers/event-form";
import { applyQuickFilter } from "../../helpers/quick-filters";
import {
  SANDBOX_TEAM,
  fillTableSearch,
  openSeededTeam,
} from "../../helpers/team-event";

const SOURCE_EVENT = "E2E Sandbox Source Event";

test.describe("Team events programme (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("the events table shows each event's programme and filters by it", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeam(page, SANDBOX_TEAM);
    const eventName = `E2E Arts Programme ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await pickDate(dialog, "Start time", new Date(Date.now() + 86_400_000));
    await dialog.getByLabel("Programme").click();
    await page.getByRole("option", { name: "Arts and culture" }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    const table = page.getByRole("table");
    await expect(
      table.getByRole("columnheader", { name: /Programme/ })
    ).toBeVisible();
    // Parallel specs add events to this team, so search rather than assume page one.
    const eventRow = table.getByRole("row").filter({ hasText: eventName });
    const sourceRow = table.getByRole("row").filter({ hasText: SOURCE_EVENT });
    await fillTableSearch(page, "Search events...", eventName);
    await expect(eventRow).toContainText("Arts and culture");
    await fillTableSearch(page, "Search events...", SOURCE_EVENT);
    await expect(sourceRow.first()).toContainText("Unallocated");

    await applyQuickFilter(page, "Programme", "Arts and culture");
    await expect(sourceRow).toHaveCount(0);
    await fillTableSearch(page, "Search events...", eventName);
    await expect(eventRow).toBeVisible();
  });
});
