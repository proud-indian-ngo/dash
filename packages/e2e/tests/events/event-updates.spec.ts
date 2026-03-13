import { expect, test } from "../../fixtures/test";

test.describe("Event updates CRUD (admin)", () => {
  test.beforeEach((_fixtures, testInfo) => {
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

    // ---- POST UPDATE ----
    await page.getByRole("button", { name: "Post Update" }).click();

    // Type in the TiptapEditor
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill("This is an E2E test update");

    // Save
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Update posted")).toBeVisible({
      timeout: 10_000,
    });

    // Verify update content is rendered
    await expect(page.getByText("This is an E2E test update")).toBeVisible({
      timeout: 10_000,
    });

    // ---- EDIT UPDATE ----
    // Find the Edit button for the update we just posted
    await page
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .click();

    // Editor should appear with existing content
    const editEditor = page.locator(".ProseMirror");
    await expect(editEditor).toBeVisible();
    await editEditor.click();
    // Select all and replace
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Updated E2E test content");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Update saved")).toBeVisible({
      timeout: 10_000,
    });

    // Verify "(edited)" label appears
    await expect(page.getByText("(edited)")).toBeVisible({ timeout: 10_000 });

    // ---- DELETE UPDATE ----
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .first()
      .click();

    // Confirm dialog
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Delete update")).toBeVisible();

    await confirmDialog
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    await expect(page.getByText("Update deleted")).toBeVisible({
      timeout: 10_000,
    });

    // Verify the update is gone
    await expect(page.getByText("No updates yet.")).toBeVisible({
      timeout: 10_000,
    });
  });
});
