import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import {
  SANDBOX_TEAM,
  fillTableSearch,
  openSeededTeam,
  openSeededTeamEvent,
} from "../../helpers/team-event";
import { ListPage } from "../../pages/list-page";

test.describe("Event updates CRUD (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("creates a past event and posts, edits, and deletes an update", async ({
    page,
  }) => {
    test.slow();

    await openSeededTeam(page, SANDBOX_TEAM);

    // Create a past event (start time = yesterday) so Updates tab appears
    const pastEventName = `E2E Past Event ${Date.now()}`;
    await page.getByRole("button", { name: "Create event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(pastEventName);

    await pickDate(
      createDialog,
      "Start time",
      new Date(Date.now() - 86_400_000)
    );

    await createDialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });

    // The list is paged by date, so search for the new event before opening it
    await fillTableSearch(page, "Search events...", pastEventName);
    const eventCell = page.getByRole("cell").filter({ hasText: pastEventName });
    await expect(eventCell).toBeVisible({ timeout: 10_000 });
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

    // Post — admin posts are auto-approved
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Update posted")).toBeVisible({
      timeout: 10_000,
    });

    // Verify update content is rendered in the approved timeline
    await expect(page.getByText("This is an E2E test update")).toBeVisible({
      timeout: 10_000,
    });

    // ---- EDIT UPDATE ----
    // The page header has its own Edit (for the event); the update's actions
    // sit in its "Update actions" menu.
    const list = new ListPage(page);
    const updateActions = page
      .getByRole("button", { name: "Update actions" })
      .first();
    await list.openActionAndClick(updateActions, "Edit");

    // The composer stays on the page, so pick the editor holding this update
    const editEditor = page
      .locator("[data-slate-editor]")
      .filter({ hasText: "This is an E2E test update" });
    await expect(editEditor).toBeVisible();
    await editEditor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Updated E2E test content");

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Update saved")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("(edited)")).toBeVisible({ timeout: 10_000 });

    // ---- DELETE UPDATE ----
    await list.openActionAndClick(updateActions, "Delete");

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog
      .getByRole("button", { exact: true, name: "Delete update" })
      .click();

    await expect(page.getByText("Update removed")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("No updates yet.")).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Event update approval (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("approves a pending update from seeded data", async ({ page }) => {
    test.slow();

    await openSeededTeamEvent(page, "E2E Past Event With Pending Update");

    // Click Updates tab — should show pending badge
    const updatesTab = page.getByRole("tab", { name: /Updates/ });
    await expect(updatesTab).toBeVisible({ timeout: 10_000 });
    await updatesTab.click();

    // Verify the "Pending approval" section is visible
    await expect(page.getByText("Pending approval")).toBeVisible({
      timeout: 10_000,
    });

    // Verify the pending update content
    await expect(page.getByText("pending update from a volunteer")).toBeVisible(
      { timeout: 10_000 }
    );

    // Verify "Pending" badge
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();

    // Approve, then Undo: the update returns and the save never runs
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Update approved")).toBeVisible();
    await expect(page.getByText("Pending approval")).toBeHidden();
    // The toast's Undo, not the editor toolbar's
    await page
      .locator("[data-sonner-toast]")
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(page.getByText("Pending approval")).toBeVisible();
    await page.waitForTimeout(6000);
    await page.reload();
    await page.getByRole("tab", { name: /Updates/ }).click();
    await expect(page.getByText("Pending approval")).toBeVisible({
      timeout: 10_000,
    });

    // Approve for real and let the Undo window pass
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Update approved")).toBeVisible({
      timeout: 10_000,
    });

    // Pending section should disappear, update should now be in the timeline
    await expect(page.getByText("Pending approval")).toBeHidden({
      timeout: 10_000,
    });
    await expect(page.getByText("pending update from a volunteer")).toBeVisible(
      { timeout: 10_000 }
    );
  });
});
