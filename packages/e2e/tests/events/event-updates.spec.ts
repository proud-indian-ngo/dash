import { expect, test } from "../../fixtures/test";

test.describe("Event updates CRUD (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("creates a past event and posts, edits, and deletes an update", async ({
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

    // Create a past event (start time = yesterday) so Updates tab appears
    const pastEventName = `E2E Past Event ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(pastEventName);

    const yesterday = new Date(Date.now() - 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(yesterday.toISOString().slice(0, 16));

    // Make it public so we can navigate to it
    await createDialog.getByLabel("Public").check();

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

    // Verify Updates tab is visible (event has started)
    const updatesTab = page.getByRole("tab", { name: /Updates/ });
    await expect(updatesTab).toBeVisible({ timeout: 10_000 });
    await updatesTab.click();

    // ---- POST UPDATE (admin → auto-approved) ----
    const editor = page.locator("[data-slate-editor]");
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type("This is an E2E test update");

    // Save — admin posts are auto-approved
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Update posted")).toBeVisible({
      timeout: 10_000,
    });

    // Verify update content is rendered in the approved timeline
    await expect(page.getByText("This is an E2E test update")).toBeVisible({
      timeout: 10_000,
    });

    // ---- EDIT UPDATE ----
    await page
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .click();

    const editEditor = page.locator("[data-slate-editor]");
    await expect(editEditor).toBeVisible();
    await editEditor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Updated E2E test content");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Update saved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("(edited)")).toBeVisible({ timeout: 10_000 });

    // ---- DELETE UPDATE ----
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    await expect(page.getByText("Update deleted")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("No updates yet.")).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Event update approval (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("approves a pending update from seeded data", async ({ page }) => {
    // Navigate to the seeded event with a pending update
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible();

    const eventLink = page
      .getByRole("table")
      .getByRole("link")
      .filter({ hasText: /E2E Past Event With Pending Update/ });
    if ((await eventLink.count()) === 0) {
      test.skip(true, "Seeded event not available");
      return;
    }
    await eventLink.first().click();
    await page.waitForURL(/\/events\/[a-zA-Z0-9-]+/, { timeout: 10_000 });

    // Click Updates tab — should show pending badge
    const updatesTab = page.getByRole("tab", { name: /Updates/ });
    await expect(updatesTab).toBeVisible({ timeout: 10_000 });
    await updatesTab.click();

    // Verify the "Pending Approval" section is visible
    await expect(page.getByText("Pending Approval")).toBeVisible({
      timeout: 10_000,
    });

    // Verify the pending update content
    await expect(page.getByText("pending update from a volunteer")).toBeVisible(
      { timeout: 10_000 }
    );

    // Verify "Pending" badge
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();

    // Approve the pending update
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Update approved")).toBeVisible({
      timeout: 10_000,
    });

    // Pending section should disappear, update should now be in the timeline
    await expect(page.getByText("Pending Approval")).toBeHidden({
      timeout: 10_000,
    });
    await expect(page.getByText("pending update from a volunteer")).toBeVisible(
      { timeout: 10_000 }
    );
  });
});
