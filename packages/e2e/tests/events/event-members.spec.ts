import { expect, test, waitForZeroReady } from "../../fixtures/test";
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
      .getByRole("button", { exact: true, name: "Add volunteer" })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Add volunteer" })
    ).toBeVisible({ timeout: 5000 });
  });
});

/** Upcoming event in the team the volunteer leads; seeded in seed-test-user. */
const LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000203";
const MEMBER_PHONE = "+919800000302";

test.describe("Event member contacts", () => {
  test("a lead without users.view reaches a member from the row menu", async ({
    financeAdminEmail,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto(`/events/${LEAD_EVENT_ID}`);
    await waitForZeroReady(page);

    await page
      .getByRole("button", { name: "Actions for Test Finance Admin" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: `Call ${MEMBER_PHONE}` })
    ).toHaveAttribute("href", `tel:${MEMBER_PHONE}`);
    await expect(
      page.getByRole("menuitem", { name: "WhatsApp" })
    ).toHaveAttribute("href", `https://wa.me/${MEMBER_PHONE.slice(1)}`);
    await expect(
      page.getByRole("menuitem", { name: `Email ${financeAdminEmail}` })
    ).toHaveAttribute("href", `mailto:${financeAdminEmail}`);
  });

  test("on phones the contacts are links in the action sheet", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto(`/events/${LEAD_EVENT_ID}`);
    await waitForZeroReady(page);

    await page
      .getByRole("button", { name: "Actions for Test Finance Admin" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Test Finance Admin" });
    await expect(
      sheet.getByRole("link", { name: `Call ${MEMBER_PHONE}` })
    ).toHaveAttribute("href", `tel:${MEMBER_PHONE}`);
  });

  test("an events.edit holder gets the same contacts", async ({
    financeAdminEmail,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto(`/events/${LEAD_EVENT_ID}`);
    await waitForZeroReady(page);

    await page
      .getByRole("button", { name: "Actions for Test Finance Admin" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: `Email ${financeAdminEmail}` })
    ).toHaveAttribute("href", `mailto:${financeAdminEmail}`);
  });

  test("a team member who is not a lead gets no row menu", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await openSeededTeamEvent(page, EVENT_NAME);
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.getByRole("button", { name: /^Actions for / })
    ).toHaveCount(0);
  });
});
