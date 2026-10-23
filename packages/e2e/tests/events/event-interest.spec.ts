import { expect, test, waitForZeroReady } from "../../fixtures/test";
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

  test("submits interest, then cancels it", async ({ page }) => {
    await page
      .getByRole("button", { exact: true, name: "Show interest" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Message (optional)")
      .fill("I would like to volunteer!");
    await dialog.getByRole("button", { name: "Submit interest" }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    const cancel = page.getByRole("button", { name: "Cancel Interest" });
    await expect(cancel).toBeVisible({ timeout: 10_000 });

    // Withdraw it so the event is open again for the next run
    await cancel.click();
    await expect(page.getByText("Interest cancelled")).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: "Show interest" })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Event interest requests (admin)", () => {
  test("admin sees a pending request with contact details, Approve and Reject", async ({
    page,
    unorientedVolunteerEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    test.slow();
    await openSeededTeamEvent(page, PENDING_EVENT);

    await expect(page.getByText(/Interest requests \(\d+\)/)).toBeVisible({
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
    // Shown inline, as touch devices cannot open the hover card
    await expect(
      page.getByRole("link", { exact: true, name: unorientedVolunteerEmail })
    ).toHaveAttribute("href", `mailto:${unorientedVolunteerEmail}`);
  });
});

test.describe("Event interest contacts (team lead)", () => {
  /** Upcoming event in the team the volunteer leads; seeded in helpers/seed/events.ts. */
  const LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000203";

  test("a lead without users.view sees the requester's contact details", async ({
    page,
    unorientedVolunteerEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto(`/events/${LEAD_EVENT_ID}`);
    await waitForZeroReady(page);

    await expect(page.getByText(/Interest requests \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("link", { exact: true, name: unorientedVolunteerEmail })
    ).toHaveAttribute("href", `mailto:${unorientedVolunteerEmail}`);
    await expect(
      page.getByRole("link", { exact: true, name: "WhatsApp" })
    ).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+$/);
  });

  test("a team member who is not a lead sees no requests or contacts", async ({
    page,
    unorientedVolunteerEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await openSeededTeamEvent(page, PENDING_EVENT);

    await expect(page.getByText(/Interest requests \(\d+\)/)).toHaveCount(0);
    await expect(
      page.getByRole("link", { exact: true, name: unorientedVolunteerEmail })
    ).toHaveCount(0);
  });
});
