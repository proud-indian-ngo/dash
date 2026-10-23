import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { uuidv7 } from "uuidv7";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { openAdvancedSettings } from "../../helpers/event-form";
import {
  SANDBOX_TEAM,
  openSeededTeam,
  searchTeamEvents,
} from "../../helpers/team-event";
import { pushMutation } from "../../helpers/zero-mutate";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/event-feedback.ts"
);

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  argument?: string
) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

interface FeedbackFixture {
  closedEventId: string;
  closedFeedbackId: string;
  notMemberEventId: string;
  openEventId: string;
  upcomingEventId: string;
}

test.describe("Event feedback — admin", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("creates a past event with feedback enabled and sees empty feedback tab", async ({
    page,
  }) => {
    test.slow();

    await openSeededTeam(page, SANDBOX_TEAM);

    // Create a past event with feedback enabled
    const pastEventName = `E2E Feedback Event ${Date.now()}`;
    await page.getByRole("button", { name: "Create event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(pastEventName);

    const yesterday = new Date(Date.now() - 86_400_000);
    await pickDate(createDialog, "Start time", yesterday);

    // Make it public so volunteers can see it
    await createDialog.getByRole("switch", { name: "Public" }).click();

    // Enable anonymous feedback
    await openAdvancedSettings(createDialog);
    await createDialog
      .getByRole("switch", { name: "Enable anonymous feedback" })
      .click();

    await createDialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await searchTeamEvents(page, pastEventName);
    await expect(page.getByText(pastEventName)).toBeVisible({
      timeout: 10_000,
    });

    // Click the event name to go to detail page
    const eventCell = page.getByRole("cell").filter({ hasText: pastEventName });
    await eventCell.getByRole("button").first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Verify Feedback tab is visible (past event with feedback enabled)
    const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Verify empty state
    await expect(page.getByText("No feedback submitted yet.")).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Event feedback — volunteer", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  // One test: CI shards split tests apart, so editing can't rely on an
  // earlier test having submitted the feedback.
  test("submits and edits own anonymous feedback; the server refuses the rest", async ({
    page,
    volunteerEmail,
  }) => {
    test.slow();
    // Setup starts from a clean slate, so every run submits afresh.
    const fx = await fixture<FeedbackFixture>("setup", volunteerEmail);
    try {
      await page.goto(`/events/${fx.openEventId}`);
      await waitForZeroReady(page);

      const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
      await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
      await feedbackTab.click();

      const panel = page.getByRole("tabpanel", { name: "Feedback" });
      const editor = panel.locator("[data-slate-editor]");
      const feedbackText = `E2E anonymous feedback ${Date.now()}`;
      await editor.click();
      await page.keyboard.type(feedbackText);
      await panel.getByRole("button", { name: "Submit feedback" }).click();
      await expect(page.getByText("Feedback submitted")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(feedbackText)).toBeVisible({
        timeout: 10_000,
      });

      await panel.getByRole("button", { exact: true, name: "Edit" }).click();
      const updatedText = `E2E updated feedback ${Date.now()}`;
      await expect(editor).toBeVisible();
      await editor.click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(updatedText);
      await panel.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Feedback updated")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(updatedText)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("(edited)")).toBeVisible({
        timeout: 10_000,
      });

      // The page offers no second submission and no form on the other
      // events, so these go to the server directly. Each event breaks
      // exactly one submit rule.
      const submit = (eventId: string, now = Date.now()) =>
        pushMutation(page.request, "eventFeedback.submit", {
          content: JSON.stringify([
            { children: [{ text: "E2E refused feedback" }], type: "p" },
          ]),
          eventId,
          feedbackId: uuidv7(),
          now,
          submissionId: uuidv7(),
        });

      await test.step("refuses a second submission for the same event", async () => {
        expect(await submit(fx.openEventId)).toEqual({
          error: "app",
          message: "You have already submitted feedback for this event",
        });
      });

      await test.step("refuses feedback after the deadline", async () => {
        expect(await submit(fx.closedEventId)).toEqual({
          error: "app",
          message: "Feedback deadline has passed",
        });
      });

      await test.step("refuses feedback before the event ends", async () => {
        expect(await submit(fx.upcomingEventId)).toEqual({
          error: "app",
          message: "Event has not ended yet",
        });
      });

      // The closed event's deadline passed an hour ago and the upcoming one
      // ends in a day and two hours; a client clock set inside each window
      // must not move the server's, for a new response or an edit.
      await test.step("judges the deadline and the event's end by the server's clock", async () => {
        const hour = 60 * 60 * 1000;
        expect(await submit(fx.closedEventId, Date.now() - 2 * hour)).toEqual({
          error: "app",
          message: "Feedback deadline has passed",
        });
        expect(
          await submit(fx.upcomingEventId, Date.now() + 48 * hour)
        ).toEqual({
          error: "app",
          message: "Event has not ended yet",
        });
        expect(
          await pushMutation(page.request, "eventFeedback.update", {
            content: JSON.stringify([
              { children: [{ text: "E2E late edit" }], type: "p" },
            ]),
            eventId: fx.closedEventId,
            feedbackId: fx.closedFeedbackId,
            now: Date.now() - 2 * hour,
          })
        ).toEqual({
          error: "app",
          message: "Feedback deadline has passed",
        });
        // Only the response seeded before the deadline, unedited.
        expect(await fixture("state")).toEqual({
          closedFeedbackUnchanged: true,
          submissionEvents: [fx.closedEventId],
        });
      });

      await test.step("refuses feedback from someone not at the event", async () => {
        expect(await submit(fx.notMemberEventId)).toEqual({
          error: "app",
          message: "You are not a member of this event",
        });
      });
    } finally {
      await fixture("cleanup");
    }
  });
});
