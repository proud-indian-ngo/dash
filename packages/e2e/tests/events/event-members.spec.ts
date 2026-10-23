import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";
import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { openSeededTeamEvent } from "../../helpers/team-event";

const execFileAsync = promisify(execFile);
const startedEventHelper = path.resolve(
  import.meta.dirname,
  "../../helpers/started-event.ts"
);

async function startedEvent<T>(
  action: "cleanup" | "setup" | "state",
  email?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", startedEventHelper, action, ...(email ? [email] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

/** Seeded upcoming event in "E2E Updates Team" with two members. */
const EVENT_NAME = "E2E Upcoming Public Bangalore";

/** A seeded user who is not a member of EVENT_NAME. */
const ADDED_NAME = "Test Finance Admin";

async function removeMemberViaMenu(page: Page, name: string) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Remove from event" }).click();
  await page.getByRole("button", { name: "Remove volunteer" }).click();
  await expect(
    page.getByRole("button", { name: `Actions for ${name}` })
  ).toHaveCount(0);
}

test.describe("Event member management (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    await openSeededTeamEvent(page, EVENT_NAME);
  });

  test("adds a volunteer through the dialog and removes them", async ({
    page,
  }) => {
    const memberActions = page.getByRole("button", {
      name: `Actions for ${ADDED_NAME}`,
    });
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
    // A run stopped part way leaves the member behind.
    if (await memberActions.isVisible()) {
      await removeMemberViaMenu(page, ADDED_NAME);
    }

    await page
      .getByRole("button", { exact: true, name: "Add volunteer" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Add volunteer" })
    ).toBeVisible({ timeout: 5000 });
    const picker = dialog.getByRole("combobox", { name: /Search volunteers/ });
    await picker.click();
    await picker.fill(ADDED_NAME);
    await page.getByRole("option").filter({ hasText: ADDED_NAME }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Add volunteer" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Volunteer added")).toBeVisible();
    await expect(memberActions).toBeVisible();

    await page.reload();
    await waitForZeroReady(page);
    await expect(memberActions).toBeVisible({ timeout: 10_000 });

    await removeMemberViaMenu(page, ADDED_NAME);
    await page.reload();
    await waitForZeroReady(page);
    await expect(page.getByText(/Volunteers \(\d+\)/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(memberActions).toHaveCount(0);
  });
});

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

/** Sends one Zero custom mutation as the page's user and returns its result. */
async function pushMutation(
  page: Page,
  name: string,
  args: Record<string, unknown>
) {
  const suffix = `${name.replace(".", "-")}-${Date.now()}`;
  const response = await page.request.post(
    "/api/zero/mutate?schema=zero_0&appID=zero",
    {
      data: {
        clientGroupID: `e2e-members-cg-${suffix}`,
        mutations: [
          {
            args: [args],
            clientID: `e2e-members-${suffix}`,
            id: 1,
            name,
            timestamp: Date.now(),
            type: "custom",
          },
        ],
        pushVersion: 1,
        requestID: `e2e-members-req-${suffix}`,
        timestamp: Date.now(),
      },
    }
  );
  expect(response.ok()).toBe(true);
  const json = await response.json();
  return json.mutations[0].result;
}

test.describe("Event member management (volunteer)", () => {
  test("a team member who is not a lead cannot add or remove members", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await openSeededTeamEvent(page, EVENT_NAME);
    const eventId = new URL(page.url()).pathname.split("/").at(-1);

    // A real event, so the refusal comes from the permission check and not
    // from a missing event.
    const added = await pushMutation(page, "teamEvent.addMembers", {
      eventId,
      members: [{ id: FAKE_ID, userId: FAKE_ID }],
      now: Date.now(),
    });
    expect(added).toMatchObject({
      error: "app",
      message: expect.stringContaining("Unauthorized"),
    });

    const removed = await pushMutation(page, "teamEvent.removeMember", {
      eventId,
      memberId: FAKE_ID,
    });
    expect(removed).toMatchObject({
      error: "app",
      message: expect.stringContaining("Unauthorized"),
    });
  });

  // The client's clock only drives its optimistic run: each mutation claims
  // an hour before the start, and the server judges by its own clock.
  test("a lead can't cancel, leave or join an event that has started, whatever the client's clock", async ({
    page,
    volunteerEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    const fx = await startedEvent<{
      joinedEventId: string;
      otherEventId: string;
      seriesId: string;
    }>("setup", volunteerEmail);
    try {
      const beforeStart = Date.now() - 2 * 60 * 60 * 1000;

      await test.step("refuses a lead's cancel without events.cancel", async () => {
        expect(
          await pushMutation(page, "teamEvent.cancel", {
            id: fx.joinedEventId,
            now: beforeStart,
          })
        ).toEqual({
          error: "app",
          message: "Cannot cancel an event that has already started",
        });
      });

      await test.step("refuses leaving", async () => {
        expect(
          await pushMutation(page, "teamEvent.leaveEvent", {
            eventId: fx.joinedEventId,
            now: beforeStart,
          })
        ).toEqual({
          error: "app",
          message: "Cannot leave event that has already started",
        });
      });

      await test.step("refuses joining", async () => {
        expect(
          await pushMutation(page, "teamEvent.joinAsMember", {
            eventId: fx.otherEventId,
            id: uuidv7(),
            now: beforeStart,
          })
        ).toEqual({
          error: "app",
          message: "Cannot join event that has already started",
        });
      });

      // "All upcoming" never cancels a started session: the series row, its
      // first session, stays live.
      await test.step("keeps a series' started first session when cancelling all", async () => {
        expect(
          await pushMutation(page, "teamEvent.cancelSeries", {
            id: fx.seriesId,
            mode: "all",
            now: beforeStart,
          })
        ).toEqual({});
      });

      expect(await startedEvent("state", volunteerEmail)).toEqual({
        joinedCancelled: false,
        seriesCancelled: false,
        memberOfJoined: true,
        memberOfOther: false,
      });
    } finally {
      await startedEvent("cleanup");
    }
  });
});

/** Upcoming event in the team the volunteer leads; seeded in helpers/seed/events.ts. */
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
