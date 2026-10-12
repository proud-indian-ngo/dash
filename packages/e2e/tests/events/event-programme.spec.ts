import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { waitForToastsToClear } from "../../helpers/event-form";
import {
  SANDBOX_TEAM,
  openSeededTeam,
  openSeededTeamEvent,
} from "../../helpers/team-event";

test.describe("Event programme (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("an event keeps its programme when edited from the detail page", async ({
    page,
  }) => {
    test.slow();
    await openSeededTeam(page, SANDBOX_TEAM);
    const eventName = `E2E Programme ${Date.now()}`;

    await page.getByRole("button", { name: "Create event" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(eventName);
    await pickDate(
      createDialog,
      "Start time",
      new Date(Date.now() + 86_400_000)
    );
    await createDialog.getByLabel("Programme").click();
    await page.getByRole("option", { name: "Education" }).click();
    await createDialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    await openSeededTeamEvent(page, eventName, SANDBOX_TEAM);
    await expect(page.getByText("Programme · Education")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    const nameInput = editDialog.getByRole("textbox", {
      exact: true,
      name: "Name",
    });
    await expect(nameInput).toHaveValue(eventName);
    await nameInput.fill(`${eventName} renamed`);
    await editDialog
      .getByRole("button", { exact: true, name: "Save changes" })
      .click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText("Programme · Education")).toBeVisible({
      timeout: 10_000,
    });
  });
});
