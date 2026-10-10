import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { waitForToastsToClear } from "../../helpers/event-form";
import { openSeededTeam, searchTeamEvents } from "../../helpers/team-event";
import { ListPage } from "../../pages/list-page";

test.describe("Event edit and cancel (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeam(page);
  });

  test("edits an existing event name and location", async ({ page }) => {
    test.slow();

    // First create an event to edit
    const originalName = `E2E Edit Target ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(originalName);
    await createDialog.getByLabel("Location").fill("Original Location");

    const tomorrow = new Date(Date.now() + 86_400_000);
    await pickDate(createDialog, "Start Time", tomorrow);

    await createDialog
      .getByRole("button", { exact: true, name: "Create" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await searchTeamEvents(page, originalName);
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 10_000 });

    // Now edit it via the row action menu
    const row = page.getByRole("row").filter({ hasText: originalName });
    await waitForToastsToClear(page);
    await new ListPage(page).openRowActionAndClick(row, "Edit");

    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();

    // Wait for form to populate before editing
    const nameInput = editDialog.getByRole("textbox", {
      exact: true,
      name: "Name",
    });
    await expect(nameInput).toHaveValue(originalName);

    const updatedName = `E2E Edited ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(updatedName);

    await editDialog.getByLabel("Location").clear();
    await editDialog.getByLabel("Location").fill("Updated Location");

    await editDialog.getByRole("button", { exact: true, name: "Save" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event updated")).toBeVisible();
    await searchTeamEvents(page, updatedName);
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test("cancels an existing future event", async ({ page }) => {
    test.slow();

    // Create a future event to cancel
    const eventName = `E2E Cancel Target ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);

    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    await pickDate(createDialog, "Start Time", nextWeek);

    await createDialog
      .getByRole("button", { exact: true, name: "Create" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await searchTeamEvents(page, eventName);
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });

    // Cancel via row action menu
    const row = page.getByRole("row").filter({ hasText: eventName });
    await waitForToastsToClear(page);
    await new ListPage(page).openRowActionAndClick(row, "Cancel");

    // Confirm dialog appears
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByRole("heading", { name: "Cancel event" })
    ).toBeVisible();
    await expect(
      confirmDialog.getByText(`Are you sure you want to cancel "${eventName}"`)
    ).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Cancel Event" }).click();

    await expect(page.getByText("Event cancelled")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mobile cancel confirmation is not dismissed by backdrop press", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ height: 932, width: 430 });

    const eventName = `E2E Mobile Cancel ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);

    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    await pickDate(createDialog, "Start Time", nextWeek);

    await createDialog
      .getByRole("button", { exact: true, name: "Create" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await searchTeamEvents(page, eventName);
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });

    const row = page.getByRole("row").filter({ hasText: eventName });
    // On phones the row menu is a bottom sheet of buttons. Its own Cancel
    // (close the sheet) comes after the Cancel event action. The row can
    // re-render as data syncs, so retry opening the sheet.
    await waitForToastsToClear(page);
    const sheet = page.getByRole("dialog", { name: /actions$/i });
    await expect(async () => {
      if (!(await sheet.isVisible())) {
        await row.getByTestId("row-actions").click();
      }
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await sheet
      .getByRole("button", { exact: true, name: "Cancel" })
      .first()
      .click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();

    await page.mouse.click(10, 10);
    await expect(confirmDialog).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Keep Event" }).click();
    await expect(confirmDialog).toBeHidden();
  });
});
