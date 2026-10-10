import { expect, test } from "../../fixtures/test";
import { openPublicEvent, openSeededTeamEvent } from "../../helpers/team-event";

/** Public, upcoming, in a team the volunteer is not in. */
const OPEN_EVENT = "E2E Open Interest Event";
/** Holds a pending request from the unoriented volunteer that no test decides. */
const PENDING_EVENT = "E2E Upcoming Event With Pending Interests";

test.describe("Event interest flow (volunteer)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await openPublicEvent(page, OPEN_EVENT);
  });

  test("opens and closes the interest dialog", async ({ page }) => {
    await page
      .getByRole("button", { exact: true, name: "Show Interest" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Show Interest" })
    ).toBeVisible();
    await expect(dialog.getByLabel("Message (optional)")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("submits interest, then cancels it", async ({ page }) => {
    await page
      .getByRole("button", { exact: true, name: "Show Interest" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Message (optional)")
      .fill("I would like to volunteer!");
    await dialog.getByRole("button", { name: "Submit Interest" }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    const cancel = page.getByRole("button", { name: "Cancel Interest" });
    await expect(cancel).toBeVisible({ timeout: 10_000 });

    // Withdraw it so the event is open again for the next run
    await cancel.click();
    await expect(page.getByText("Interest cancelled")).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: "Show Interest" })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Event interest requests (admin)", () => {
  test("admin sees a pending request with Approve and Reject", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    await openSeededTeamEvent(page, PENDING_EVENT);

    await expect(page.getByText(/Interest Requests \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Approve Test Unoriented Volunteer",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Reject Test Unoriented Volunteer",
      })
    ).toBeVisible();
  });
});
