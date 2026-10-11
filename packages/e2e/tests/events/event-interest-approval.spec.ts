import { expect, test } from "../../fixtures/test";
import { openSeededTeamEvent } from "../../helpers/team-event";

const EVENT_NAME = "E2E Upcoming Event With Pending Interests";
/** The Undo window plus a margin, so the delayed save has run. */
const SAVE_WAIT_MS = 6000;

test.describe("Event interest approval (admin)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    await openSeededTeamEvent(page, EVENT_NAME);
    await expect(page.getByText(/Interest Requests \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("approves an interest request, with Undo", async ({ page }) => {
    const approve = page.getByRole("button", {
      exact: true,
      name: "Approve Test Volunteer",
    });

    // Undo cancels the save, so the request stays pending after a reload
    await approve.click();
    await expect(page.getByText("Interest approved")).toBeVisible();
    await expect(approve).toBeHidden();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(approve).toBeVisible();
    await page.waitForTimeout(SAVE_WAIT_MS);
    await page.reload();
    await expect(approve).toBeVisible({ timeout: 10_000 });

    // Approve for real and let the Undo window pass
    await approve.click();
    await expect(page.getByText("Interest approved")).toBeVisible();
    await page.waitForTimeout(SAVE_WAIT_MS);
    await page.reload();
    await expect(page.getByText(/Interest Requests \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(approve).toHaveCount(0);
  });

  test("rejects an interest request", async ({ page }) => {
    const reject = page.getByRole("button", {
      exact: true,
      name: "Reject Test Finance Admin",
    });
    await reject.click();
    await expect(page.getByText("Interest rejected")).toBeVisible();
    await page.waitForTimeout(SAVE_WAIT_MS);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(reject).toHaveCount(0);
  });
});
