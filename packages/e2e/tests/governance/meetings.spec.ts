import type { Locator } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/**
 * Board meetings against the seeded board and the seeded meeting of 10 Oct
 * 2026 (packages/db/src/seed-governance.ts): Asha Rao (Managing Trustee),
 * Vikram Menon and Meera Iyer were in office that day, and version 2 of the
 * deed (a quorum of half the board, at least two, video counting) was in
 * force. The first test takes the seeded meeting through to its minutes;
 * the others create their own meetings. Signing the minutes needs the
 * signing service, which E2E doesn't run.
 */

const SEEDED_MEETING = "Board meeting, October 2026";

async function pickDay(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  await scope.getByRole("button", { exact: true, name: label }).click();
  const popup = page.getByRole("dialog").last();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  const step = date < new Date() ? /previous month/i : /next month/i;
  for (let month = 0; month < 24 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: step }).click();
  }
  await day.click();
  await expect(day).toBeHidden();
}

async function choose(scope: Locator, label: string, option: string) {
  await scope.getByRole("combobox", { name: label }).click();
  await scope.page().getByRole("option", { exact: true, name: option }).click();
  await expect(scope.getByRole("combobox", { name: label })).toContainText(
    option
  );
}

/** Attendance and votes are one tap on a segmented control. */
async function tap(scope: Locator, group: string, option: string) {
  const button = scope
    .getByRole("group", { name: group })
    .getByRole("button", { exact: true, name: option });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test.describe("board meetings (super admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("takes attendance, decides a tie by the chair's casting vote and makes the minutes", async ({
    page,
  }) => {
    test.slow();
    await page.goto("/governance/meetings");
    await page.getByRole("row", { name: new RegExp(SEEDED_MEETING) }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_MEETING })
    ).toBeVisible();
    await expect(
      page.getByText("Deed version 2", { exact: false })
    ).toBeVisible();

    const attendance = page.getByRole("region", { name: "Attendance" });
    await tap(attendance, "Attendance of Asha Rao", "Present");
    await tap(attendance, "Attendance of Vikram Menon", "On video");

    const agenda = page.getByRole("region", { name: "Agenda" });
    const item = agenda.getByRole("listitem").filter({
      hasText: "Approve the budget for 2027-28",
    });
    await tap(item, "Vote of Asha Rao", "For");
    await tap(item, "Vote of Vikram Menon", "Against");
    await expect(item.getByText("Quorum met · 2 of 2")).toBeVisible();
    await expect(item.getByText("1 for, 1 against")).toBeVisible();

    await choose(item, "The chair's casting vote", "For");
    await item.getByRole("button", { name: "Record the decision" }).click();
    const confirm = page.getByRole("alertdialog", {
      name: "Record the decision?",
    });
    await expect(confirm).toContainText("It passes");
    await confirm.getByRole("button", { name: "Record" }).click();
    await expect(item.getByText("Passed", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(item.getByText(/PI\/TR\/2026-27\/\d{3}/)).toBeVisible();

    await page.getByRole("button", { name: "Close the meeting" }).click();
    await page
      .getByRole("alertdialog", { name: "Close the meeting?" })
      .getByRole("button", { name: "Close the meeting" })
      .click();
    await expect(page.getByText("Held", { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    const minutes = page.getByRole("region", { name: "Minutes" });
    await minutes
      .getByRole("textbox", { name: "Proceedings" })
      .fill("The chair opened the meeting and confirmed the quorum.");
    await minutes.getByRole("button", { name: "Save proceedings" }).click();
    await expect(
      minutes.getByRole("button", { name: "Save proceedings" })
    ).toBeDisabled();
    // Making the minutes stores the PDF in R2, which CI does not have.
    if (!process.env.CI) {
      await minutes.getByRole("button", { name: "Make the minutes" }).click();
      await expect(
        minutes.getByRole("link", { name: "Download minutes" })
      ).toHaveAttribute("href", /kind=meetingMinutes/, { timeout: 30_000 });
    }
  });

  test("won't send a notice short of the deed's seven days, then sends it", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E meeting ${Date.now()}`;
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const later = new Date();
    later.setDate(later.getDate() + 10);

    await page.goto("/governance/meetings");
    await page.getByRole("button", { name: "New meeting" }).click();
    const dialog = page.getByRole("dialog", { name: "New meeting" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await pickDay(dialog, "Day", soon);
    await dialog.getByRole("button", { name: "Create meeting" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: title })
    ).toBeVisible();
    await expect(page.getByText("needs at least 7 days' notice")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send notice" })
    ).toBeDisabled();

    const agenda = page.getByRole("region", { name: "Agenda" });
    await agenda.getByRole("button", { name: "Add a discussion item" }).click();
    const add = page.getByRole("alertdialog", {
      name: "Add a discussion item",
    });
    await add.getByLabel("Title", { exact: true }).fill("Volunteer programme");
    await add.getByRole("button", { name: "Add to agenda" }).click();
    await expect(agenda.getByText("1. Volunteer programme")).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit meeting" }).click();
    const edit = page.getByRole("dialog", { name: "Edit meeting" });
    await pickDay(edit, "Day", later);
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();

    await page.getByRole("button", { name: "Send notice" }).click();
    await page
      .getByRole("alertdialog", { name: "Send the notice?" })
      .getByRole("button", { name: "Send notice" })
      .click();
    await expect(page.getByText("Notice sent", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const attendance = page.getByRole("region", { name: "Attendance" });
    await expect(attendance.getByText("Asha Rao")).toBeVisible();
    await expect(attendance.getByText("Vikram Menon")).toBeVisible();
    await expect(
      attendance.getByText("Attendance is taken once the meeting starts.")
    ).toBeVisible();
  });

  test("records a deed version only after the one before it", async ({
    page,
  }) => {
    await page.goto("/governance/deed");
    await expect(
      page.getByRole("heading", { name: /Version 2: Deed of amendment/ })
    ).toBeVisible();
    await page.getByRole("button", { name: "Add a version" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a deed version" });
    await dialog
      .getByRole("textbox", { name: "Title" })
      .fill("E2E deed of amendment");
    await pickDay(dialog, "Takes effect", new Date(2025, 5, 2));
    await dialog.getByRole("button", { name: "Add version" }).click();
    await expect(
      page.getByText("A new version takes effect after the one before it", {
        exact: false,
      })
    ).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});

test.describe("board meetings access", () => {
  test("a volunteer sees no meeting whose notice didn't go to them", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    await page.goto("/governance/meetings");
    await expect(
      page.getByText("You haven't been given notice of a meeting.")
    ).toBeVisible();
    await page.goto(
      "/governance/meetings/01930000-0000-7000-8000-00000000d401"
    );
    await expect(
      page.getByText(
        "This meeting doesn't exist, or its notice didn't go to you."
      )
    ).toBeVisible();
    await expect(page.getByText(SEEDED_MEETING)).toBeHidden();
  });
});
