import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import {
  openAdvancedSettings,
  waitForToastsToClear,
} from "../../helpers/event-form";
import { applyQuickFilter } from "../../helpers/quick-filters";
import {
  SANDBOX_TEAM,
  fillTableSearch,
  openSeededTeam,
} from "../../helpers/team-event";
import { ListPage } from "../../pages/list-page";

const SOURCE_EVENT = "E2E Sandbox Source Event";

test.describe("Team events programme (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("the events table shows each event's programme and filters by it", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeam(page, SANDBOX_TEAM);
    const eventName = `E2E Arts Programme ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await pickDate(dialog, "Start time", new Date(Date.now() + 86_400_000));
    await dialog.getByLabel("Programme").click();
    await page.getByRole("option", { name: "Arts and culture" }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    const table = page.getByRole("table");
    await expect(
      table.getByRole("columnheader", { name: /Programme/ })
    ).toBeVisible();
    // Parallel specs add events to this team, so search rather than assume page one.
    const eventRow = table.getByRole("row").filter({ hasText: eventName });
    const sourceRow = table.getByRole("row").filter({ hasText: SOURCE_EVENT });
    await fillTableSearch(page, "Search events...", eventName);
    await expect(eventRow).toContainText("Arts and culture");
    await fillTableSearch(page, "Search events...", SOURCE_EVENT);
    await expect(sourceRow.first()).toContainText("Unallocated");

    await applyQuickFilter(page, "Programme", "Arts and culture");
    await expect(sourceRow).toHaveCount(0);
    await fillTableSearch(page, "Search events...", eventName);
    await expect(eventRow).toBeVisible();
  });

  test("an occurrence edited on its own shows its own programme", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeam(page, SANDBOX_TEAM);
    const eventName = `E2E Occurrence Programme ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await pickDate(dialog, "Start time", new Date(Date.now() + 86_400_000));
    await dialog.getByLabel("Programme").click();
    await page.getByRole("option", { name: "Community support" }).click();
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    const table = page.getByRole("table");
    const seriesRows = table.getByRole("row").filter({ hasText: eventName });
    await fillTableSearch(page, "Search events...", eventName);
    await expect(seriesRows.nth(1)).toBeVisible({ timeout: 10_000 });

    // The first row is the series parent; edit only the next occurrence.
    await new ListPage(page).openRowActionAndClick(seriesRows.nth(1), "Edit");
    await page.getByRole("button", { name: "This event only" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    // A single occurrence can't change the series' recurrence.
    await openAdvancedSettings(editDialog);
    await expect(
      editDialog.getByText("Recurrence", { exact: true })
    ).toBeHidden();
    await editDialog.getByLabel("Programme").click();
    await page.getByRole("option", { name: "Education" }).click();
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    await expect(seriesRows.filter({ hasText: "Education" })).toHaveCount(1);
    await expect(
      seriesRows.filter({ hasText: "Community support" }).first()
    ).toBeVisible();

    await applyQuickFilter(page, "Programme", "Education");
    await fillTableSearch(page, "Search events...", eventName);
    await expect(seriesRows).toHaveCount(1);
    await expect(seriesRows).toContainText("Education");

    // Editing the whole series from that occurrence shows the series' programme.
    await new ListPage(page).openRowActionAndClick(seriesRows, "Edit");
    await page
      .getByRole("button", { name: "All events in the series" })
      .click();
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    await expect(editDialog.getByLabel("Programme")).toHaveValue(
      "Community support"
    );
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden();

    // So does editing this and following events from the occurrence's page.
    await new ListPage(page).openRowActionAndClick(seriesRows, "View");
    await expect(page).toHaveURL(/\/events\//);
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    await page
      .getByRole("button", { name: "This and following events" })
      .click();
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    await expect(editDialog.getByLabel("Programme")).toHaveValue(
      "Community support"
    );
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden();
  });
  test("an occurrence edited twice on its own keeps its own name", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeam(page, SANDBOX_TEAM);
    const eventName = `E2E Occurrence Name ${Date.now()}`;
    const renamed = `${eventName} Renamed`;
    const ownHall = `E2E Own Hall ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await dialog.getByLabel("Location").fill("E2E Series Hall");
    await pickDate(dialog, "Start time", new Date(Date.now() + 86_400_000));
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    const table = page.getByRole("table");
    const seriesRows = table.getByRole("row").filter({ hasText: eventName });
    const renamedRows = table.getByRole("row").filter({ hasText: renamed });
    await fillTableSearch(page, "Search events...", eventName);
    await expect(seriesRows.nth(1)).toBeVisible({ timeout: 10_000 });

    // The first row is the series parent; rename only the next occurrence.
    await new ListPage(page).openRowActionAndClick(seriesRows.nth(1), "Edit");
    await page.getByRole("button", { name: "This event only" }).click();
    const editDialog = page.getByRole("dialog");
    const nameField = editDialog.getByRole("textbox", {
      exact: true,
      name: "Name",
    });
    await expect(nameField).toHaveValue(eventName);
    await nameField.fill(renamed);
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    await expect(renamedRows).toHaveCount(1);
    await expect(seriesRows.first()).not.toContainText(renamed);

    // Editing it again prefills its own name, so changing only the location
    // keeps the rename.
    await fillTableSearch(page, "Search events...", renamed);
    await expect(renamedRows).toHaveCount(1);
    await new ListPage(page).openRowActionAndClick(renamedRows, "Edit");
    await page.getByRole("button", { name: "This event only" }).click();
    await expect(nameField).toHaveValue(renamed);
    await expect(editDialog.getByLabel("Location")).toHaveValue(
      "E2E Series Hall"
    );
    await editDialog.getByLabel("Location").fill(ownHall);
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    await expect(renamedRows).toHaveCount(1);
    await expect(renamedRows).toContainText(ownHall);
    await fillTableSearch(page, "Search events...", eventName);
    await expect(renamedRows).toHaveCount(1);
    await expect(seriesRows.filter({ hasText: ownHall })).toHaveCount(1);

    await new ListPage(page).openRowActionAndClick(renamedRows, "View");
    await expect(page).toHaveURL(/\/events\//);
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    // Editing the whole series from the occurrence's page shows the series'
    // name and its weekly rule.
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    await page
      .getByRole("button", { name: "All events in the series" })
      .click();
    await expect(nameField).toHaveValue(eventName);
    await expect(editDialog.getByLabel("Location")).toHaveValue(
      "E2E Series Hall"
    );
    await openAdvancedSettings(editDialog);
    await expect(
      editDialog.getByRole("combobox").filter({ hasText: /^Weekly$/ })
    ).toBeVisible();
    await expect(editDialog.getByText("On days")).toBeVisible();
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden();
  });

  test("editing all events from a later occurrence keeps the series start", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeam(page, SANDBOX_TEAM);
    const eventName = `E2E Series Start ${Date.now()}`;
    const description = `E2E series description ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await pickDate(dialog, "Start time", new Date(Date.now() + 86_400_000));
    await openAdvancedSettings(dialog);
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    const table = page.getByRole("table");
    const seriesRows = table.getByRole("row").filter({ hasText: eventName });
    await fillTableSearch(page, "Search events...", eventName);
    await expect(seriesRows.nth(2)).toBeVisible({ timeout: 10_000 });
    const rowCount = await seriesRows.count();
    // The first row is the series start: its date and time.
    const firstRowText = (await seriesRows.first().textContent()) ?? "";
    const laterRowText = (await seriesRows.nth(2).textContent()) ?? "";
    expect(firstRowText).not.toBe(laterRowText);

    // Edit the whole series from a later occurrence, changing only the
    // description.
    await new ListPage(page).openRowActionAndClick(seriesRows.nth(2), "Edit");
    await page
      .getByRole("button", { name: "All events in the series" })
      .click();
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    await editDialog.getByLabel("Description").fill(description);
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    // The series still starts on its first date at its time.
    await expect(seriesRows).toHaveCount(rowCount);
    await expect(seriesRows.first()).toHaveText(firstRowText);
    await expect(seriesRows.nth(2)).toHaveText(laterRowText);

    // And the description saved to the series. The series start row edits
    // the series itself, without asking for a scope.
    await new ListPage(page).openRowActionAndClick(seriesRows.first(), "Edit");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();
    await expect(editDialog.getByLabel("Description")).toHaveValue(description);
    await editDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(editDialog).toBeHidden();
  });
});
