import { expect, test } from "../../fixtures/test";

test.describe("Event feedback — admin", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("creates a past event with feedback enabled and sees empty feedback tab", async ({
    page,
  }) => {
    test.slow();

    // Navigate to teams page
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Create a past event with feedback enabled
    const pastEventName = `E2E Feedback Event ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(pastEventName);

    const yesterday = new Date(Date.now() - 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(yesterday.toISOString().slice(0, 16));

    // Make it public so volunteers can see it
    await createDialog.getByLabel("Public").check();

    // Enable anonymous feedback
    await createDialog.getByLabel("Enable anonymous feedback").check();

    await createDialog
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
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

  test("submits anonymous feedback on a past event", async ({ page }) => {
    test.slow();

    // Navigate to public events
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();

    // Find an event that has feedback enabled (created by admin test or seeded)
    const feedbackEvent = page
      .getByRole("link")
      .filter({ hasText: /E2E Feedback Event/ });
    if ((await feedbackEvent.count()) === 0) {
      test.skip(true, "No feedback-enabled event available");
      return;
    }
    await feedbackEvent.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Click the Feedback tab
    const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Fill in feedback textarea and submit
    const feedbackText = `E2E anonymous feedback ${Date.now()}`;
    await page
      .getByPlaceholder("Share your anonymous feedback...")
      .fill(feedbackText);

    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Feedback submitted")).toBeVisible({
      timeout: 10_000,
    });

    // Verify the submitted feedback content appears
    await expect(page.getByText(feedbackText)).toBeVisible({
      timeout: 10_000,
    });

    // Verify Edit button is visible
    await expect(
      page.getByRole("button", { name: "Edit", exact: true })
    ).toBeVisible();
  });

  test("edits own anonymous feedback", async ({ page }) => {
    test.slow();

    // Navigate to public events
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();

    // Find the feedback-enabled event
    const feedbackEvent = page
      .getByRole("link")
      .filter({ hasText: /E2E Feedback Event/ });
    if ((await feedbackEvent.count()) === 0) {
      test.skip(true, "No feedback-enabled event available");
      return;
    }
    await feedbackEvent.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Click the Feedback tab
    const feedbackTab = page.getByRole("tab", { name: /Feedback/ });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Click Edit to modify existing feedback
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    // Clear and type updated content
    const updatedText = `E2E updated feedback ${Date.now()}`;
    const textarea = page.getByPlaceholder("Update your feedback...");
    await expect(textarea).toBeVisible();
    await textarea.clear();
    await textarea.fill(updatedText);

    // Save the update
    await page.getByRole("button", { name: "Save" }).click();
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
