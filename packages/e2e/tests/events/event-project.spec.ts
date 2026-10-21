import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { pickDate } from "../../helpers/date-time-picker";
import { waitForToastsToClear } from "../../helpers/event-form";
import {
  SANDBOX_TEAM,
  openSeededTeam,
  openSeededTeamEvent,
} from "../../helpers/team-event";

const execFileAsync = promisify(execFile);

/** Adds an active project under Education through `helpers/event-project.ts`. */
async function seedProject(name: string) {
  await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/event-project.ts"),
      "project",
      name,
    ],
    { env: process.env }
  );
}

async function openCreateDialog(page: Page, eventName: string) {
  await openSeededTeam(page, SANDBOX_TEAM);
  await page.getByRole("button", { name: "Create event" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { exact: true, name: "Name" })
    .fill(eventName);
  await pickDate(dialog, "Start time", new Date(Date.now() + 86_400_000));
  await dialog.getByLabel("Programme").click();
  await page.getByRole("option", { name: "Education" }).click();
  return dialog;
}

test.describe("Event project", () => {
  test("finance sets an event's project, and it survives an edit", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance-only test");
    test.slow();
    const stamp = Date.now();
    const projectName = `E2E Event Project ${stamp}`;
    const eventName = `E2E Project Event ${stamp}`;
    await seedProject(projectName);

    const dialog = await openCreateDialog(page, eventName);
    const projectInput = dialog.getByRole("combobox", { name: "Project" });
    await projectInput.click();
    await projectInput.fill(projectName);
    await page.getByRole("option", { name: projectName }).click();
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    await openSeededTeamEvent(page, eventName, SANDBOX_TEAM);
    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("combobox", { name: "Project" })
    ).toHaveValue(projectName, { timeout: 10_000 });
    await editDialog
      .getByRole("textbox", { exact: true, name: "Name" })
      .fill(`${eventName} renamed`);
    await editDialog
      .getByRole("button", { exact: true, name: "Save changes" })
      .click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await waitForToastsToClear(page);

    await page.getByRole("button", { exact: true, name: "Edit" }).click();
    await expect(
      page.getByRole("dialog").getByRole("combobox", { name: "Project" })
    ).toHaveValue(projectName, { timeout: 10_000 });
  });

  test("the event form shows no project without finance.manage", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    const dialog = await openCreateDialog(page, `E2E No Project ${Date.now()}`);
    await expect(dialog.getByLabel("Programme")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Project" })).toHaveCount(
      0
    );
  });
});
