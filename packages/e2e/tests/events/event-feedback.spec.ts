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
  // Submit then edit the same feedback, in order.
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
  });

  test("submits anonymous feedback on a past event", async ({ page }) => {
    test.slow();

    await openPublicEvent(page, SEEDED_FEEDBACK_EVENT);

    // Click the Feedback tab
    const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Write feedback in the editor and save
    const feedbackText = `E2E anonymous feedback ${Date.now()}`;
    const editor = page.locator("[data-slate-editor]").first();
    await editor.click();
    await page.keyboard.type(feedbackText);
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Feedback submitted")).toBeVisible({
      timeout: 10_000,
    });

    // Verify the submitted feedback content appears
    await expect(page.getByText(feedbackText)).toBeVisible({
      timeout: 10_000,
    });

    // Verify Edit button is visible
    await expect(
      page.getByRole("button", { exact: true, name: "Edit" })
    ).toBeVisible();
  });

  test("edits own anonymous feedback", async ({ page }) => {
    test.slow();

    await openPublicEvent(page, SEEDED_FEEDBACK_EVENT);

    // Click the Feedback tab
    const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Click Edit to modify existing feedback
    await page.getByRole("button", { exact: true, name: "Edit" }).click();

    // Clear and type updated content
    const updatedText = `E2E updated feedback ${Date.now()}`;
    const editor = page.locator("[data-slate-editor]").first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(updatedText);

    // Save the update
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Feedback updated")).toBeVisible({
      timeout: 10_000,
    });

    // Verify updated content appears
    await expect(page.getByText(updatedText)).toBeVisible({
      timeout: 10_000,
    });

    // Verify "(edited)" label appears
    await expect(page.getByText("(edited)")).toBeVisible({ timeout: 10_000 });
  });
});
