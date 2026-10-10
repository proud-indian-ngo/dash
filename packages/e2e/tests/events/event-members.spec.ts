import { expect, test } from "../../fixtures/test";
import { openSeededTeamEvent } from "../../helpers/team-event";

/** Seeded upcoming event in "E2E Updates Team" with two members. */
const EVENT_NAME = "E2E Upcoming Public Bangalore";

test.describe("Event member management (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await openSeededTeamEvent(page, EVENT_NAME);
  });

  test("shows the event's volunteers on its page", async ({ page }) => {
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("can open the add volunteer dialog from the event page", async ({
    page,
  }) => {
    await page
      .getByRole("button", { exact: true, name: "Add Volunteer" })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Add Volunteer" })
    ).toBeVisible({ timeout: 5000 });
  });
});
