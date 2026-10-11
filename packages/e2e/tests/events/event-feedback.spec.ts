import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { openAdvancedSettings } from "../../helpers/event-form";
import {
  SANDBOX_TEAM,
  openPublicEvent,
  openSeededTeam,
  searchTeamEvents,
} from "../../helpers/team-event";

const SEEDED_FEEDBACK_EVENT = "E2E Seeded Feedback Event";

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
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(pastEventName);

    const yesterday = new Date(Date.now() - 86_400_000);
    await pickDate(createDialog, "Start Time", yesterday);

    // Make it public so volunteers can see it
    await createDialog.getByRole("switch", { name: "Public" }).click();

    // Enable anonymous feedback
    await openAdvancedSettings(createDialog);
    await createDialog
      .getByRole("switch", { name: "Enable anonymous feedback" })
      .click();

    await createDialog
      .getByRole("button", { exact: true, name: "Create" })
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
  test("submits and then edits own anonymous feedback", async ({ page }) => {
    test.slow();

    await openPublicEvent(page, SEEDED_FEEDBACK_EVENT);

    // Click the Feedback tab
    const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Submit feedback first, unless a retry on the same data already did
    const panel = page.getByRole("tabpanel", { name: "Feedback" });
    const editButton = panel.getByRole("button", { exact: true, name: "Edit" });
    const editor = panel.locator("[data-slate-editor]");
    await expect(editButton.or(editor)).toBeVisible({ timeout: 10_000 });
    if (!(await editButton.isVisible())) {
      const feedbackText = `E2E anonymous feedback ${Date.now()}`;
      await editor.click();
      await page.keyboard.type(feedbackText);
      await panel.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Feedback submitted")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(feedbackText)).toBeVisible({
        timeout: 10_000,
      });
    }

    // Click Edit to modify the feedback
    await editButton.click();

    // Replace the content
    const updatedText = `E2E updated feedback ${Date.now()}`;
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(updatedText);

    // Save the update
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Feedback updated")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(updatedText)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("(edited)")).toBeVisible({ timeout: 10_000 });
  });
});
