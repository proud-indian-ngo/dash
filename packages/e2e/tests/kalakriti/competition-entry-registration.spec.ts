import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { Locator } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiEntriesPage } from "../../pages/kalakriti-entries-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-entries.ts"
);
type FixtureKind = "admin" | "liaison";

interface EntryState {
  audits: { action: string }[];
  entries: { id: string }[];
  members: { entryId: string; studentId: string }[];
}

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  kind: FixtureKind,
  email?: string
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, kind, ...(email ? [email] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

async function waitForEntryCount(
  kind: FixtureKind,
  expected: number
): Promise<EntryState> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    // biome-ignore lint/performance/noAwaitInLoops: polling must observe each committed state before retrying
    const state = await fixture<EntryState>("state", kind);
    if (state.entries.length === expected) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${expected} Competition Entries`);
}

async function waitForSubmissionSettled(
  dialog: Locator,
  submitLabel: "Register Entries" | "Register Group"
) {
  await expect
    .poll(async () => {
      if (!(await dialog.isVisible())) {
        return true;
      }
      return (
        (await dialog
          .getByRole("button", { exact: true, name: submitLabel })
          .count()) === 1
      );
    })
    .toBe(true);
}

test.describe("Kalakriti Competition Entry registration", () => {
  test.describe.configure({ mode: "serial" });

  test("allows an assigned Liaison to register and remove an individual Entry", async ({
    page,
    volunteerEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "volunteer",
      "Volunteer Liaison Entry workflow"
    );
    test.slow();
    const { year } = await fixture<{ year: number }>(
      "setup",
      "liaison",
      volunteerEmail
    );
    const entriesPage = new KalakritiEntriesPage(page);

    try {
      await entriesPage.goto(year, "Spoken Word");
      const unflaggedDialog = await entriesPage.openRegistrationForm();
      await entriesPage.fillEntries(unflaggedDialog, ["Entry Student A"]);
      await expect(
        unflaggedDialog.getByTestId("entry-music-upload")
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(unflaggedDialog).toBeHidden();

      await entriesPage.goto(year);
      const dialog = await entriesPage.openRegistrationForm();
      await expect(dialog.getByTestId("entry-music-upload")).toHaveCount(0);
      await entriesPage.fillEntries(dialog, ["Entry Student A"]);
      await expect(dialog.getByTestId("entry-music-upload")).toHaveCount(1);
      await entriesPage.fillEntries(dialog, ["Entry Student B"]);
      await expect(dialog.getByTestId("entry-music-upload")).toHaveCount(0);
      await dialog.getByRole("button", { name: "Register Entries" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByText("2 Competition Entries registered", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("Entry Student A", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("Entry Student B", { exact: true })
      ).toBeVisible();

      const studentA = page.getByRole("row", { name: /Entry Student A/ });
      const studentB = page.getByRole("row", { name: /Entry Student B/ });
      await expect(studentA.getByTestId("entry-music")).toContainText("None");
      await expect(studentB.getByTestId("entry-music")).toContainText("None");
      if (!process.env.CI) {
        await waitForZeroReady(page);
        await expect(async () => {
          await entriesPage.attachMusic(studentA);
          await expect(studentA.getByTestId("entry-music")).toContainText(
            "track.mp3",
            { timeout: 15_000 }
          );
        }).toPass({ timeout: 45_000 });
        await entriesPage.expectMusicDownloadOk(studentA, "track.mp3");
      }

      for (const studentName of ["Entry Student A", "Entry Student B"]) {
        // biome-ignore lint/performance/noAwaitInLoops: each removal closes the shared confirmation dialog before the next row action
        await page
          .getByRole("button", { name: `Actions for ${studentName}` })
          .click();
        await page.getByRole("menuitem", { name: "Remove Entry" }).click();
        await page
          .getByRole("alertdialog", { name: "Remove Competition Entry?" })
          .getByRole("button", { name: "Remove Entry" })
          .click();
      }
      await expect(
        page.getByText("Competition Entry removed", { exact: true })
      ).toBeVisible();

      const state = await waitForEntryCount("liaison", 0);
      expect(state.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(["created", "deleted"])
      );
    } finally {
      await page.goto("about:blank");
      await fixture("cleanup", "liaison");
    }
  });

  test("allows an assigned Liaison to create, edit, and remove a group Entry", async ({
    page,
    volunteerEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "volunteer",
      "Volunteer Liaison group Entry workflow"
    );
    test.slow();
    const { year } = await fixture<{ year: number }>(
      "setup",
      "liaison",
      volunteerEmail
    );
    const entriesPage = new KalakritiEntriesPage(page);

    try {
      await entriesPage.goto(year, "Group Dance");
      const dialog = await entriesPage.openRegistrationForm();
      await entriesPage.selectGroupMembers(dialog, ["Entry Student A"]);
      await dialog.getByLabel("Group members").blur();
      await expect(
        dialog.getByText("Select at least 2 Students for this group")
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Register Group" })
      ).toBeDisabled();

      await dialog.getByLabel("Group members").fill("Entry Student D");
      await expect(
        page.getByRole("option", { name: /Entry Student D/ })
      ).toHaveCount(0);
      await dialog.getByLabel("Group members").fill("");
      await entriesPage.selectGroupMembers(dialog, ["Entry Student B"]);
      if (!process.env.CI) {
        await entriesPage.attachMusic(dialog);
        await expect(
          page.getByText("Audio uploaded", { exact: true })
        ).toBeVisible();
        await expect(dialog.getByText("track.mp3")).toBeVisible();
      }
      await dialog.getByRole("button", { name: "Register Group" }).click();
      await expect(
        page.getByText("Competition group registered", { exact: true })
      ).toBeVisible();
      await expect(
        page.locator("#main").getByText("Entry Student A", { exact: true })
      ).toBeVisible();
      await expect(
        page.locator("#main").getByText("Entry Student B", { exact: true })
      ).toBeVisible();
      if (!process.env.CI) {
        await expect(page.getByTestId("entry-music")).toContainText(
          "track.mp3"
        );
        await entriesPage.attachMusic(
          page.getByTestId("entry-music"),
          "remix.mp3"
        );
        await expect(
          page.getByText("Audio replaced", { exact: true })
        ).toBeVisible();
        await expect(page.getByTestId("entry-music")).toContainText(
          "remix.mp3"
        );
        await entriesPage.expectMusicDownloadOk(
          page.getByTestId("entry-music"),
          "remix.mp3"
        );
        await page.getByRole("button", { name: "Remove remix.mp3" }).click();
        await expect(
          page.getByText("Audio removed", { exact: true })
        ).toBeVisible();
      }
      await expect(page.getByTestId("entry-music")).toContainText("None");

      await page
        .getByRole("button", { name: "Actions for Group Dance group" })
        .click();
      await page.getByRole("menuitem", { name: "Edit Group" }).click();
      const editDialog = page.getByRole("dialog", {
        name: "Edit Competition Group",
      });
      await expect(editDialog).toBeVisible();
      await expect(
        editDialog.getByText("Entry Student A", { exact: false })
      ).toBeVisible();
      await expect(
        editDialog.getByText("Entry Student B", { exact: false })
      ).toBeVisible();
      await entriesPage.removeLastGroupMember(editDialog);
      await entriesPage.selectGroupMembers(editDialog, ["Entry Student C"]);
      await editDialog.getByRole("button", { name: "Save Group" }).click();
      await expect(
        page.getByText("Competition group updated", { exact: true })
      ).toBeVisible();
      await expect(
        page.locator("#main").getByText("Entry Student C", { exact: true })
      ).toBeVisible();

      const updatedState = await waitForEntryCount("liaison", 1);
      expect(
        updatedState.members
          .map((member) => member.studentId)
          .sort((first, second) => first.localeCompare(second))
      ).toEqual(
        [
          "019f0000-0000-7000-8000-00000000e206",
          "019f0000-0000-7000-8000-00000000e212",
        ].sort((first, second) => first.localeCompare(second))
      );
      expect(updatedState.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(["created", "updated"])
      );

      await page
        .getByRole("button", { name: "Actions for Group Dance group" })
        .click();
      await page.getByRole("menuitem", { name: "Remove Entry" }).click();
      await page
        .getByRole("alertdialog", { name: "Remove Competition Entry?" })
        .getByRole("button", { name: "Remove Entry" })
        .click();
      await expect(
        page.getByText("Competition Entry removed", { exact: true })
      ).toBeVisible();

      const removedState = await waitForEntryCount("liaison", 0);
      expect(removedState.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(["created", "updated", "deleted"])
      );
    } finally {
      await page.goto("about:blank");
      await fixture("cleanup", "liaison");
    }
  });

  test("serializes duplicate submissions for one Student and Session", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Super-admin duplicate Entry race"
    );
    test.slow();
    const { year } = await fixture<{ year: number }>(
      "setup",
      "admin",
      superAdminEmail
    );
    const secondPage = await page.context().newPage();
    const firstEntriesPage = new KalakritiEntriesPage(page);
    const secondEntriesPage = new KalakritiEntriesPage(secondPage);

    try {
      await Promise.all([
        firstEntriesPage.goto(year),
        secondEntriesPage.goto(year),
      ]);
      const [firstDialog, secondDialog] = await Promise.all([
        firstEntriesPage.openRegistrationForm(),
        secondEntriesPage.openRegistrationForm(),
      ]);
      await Promise.all([
        firstEntriesPage.fillEntry(firstDialog, "Entry Student A"),
        secondEntriesPage.fillEntry(secondDialog, "Entry Student A"),
      ]);
      await Promise.all([
        firstDialog.getByRole("button", { name: "Register Entries" }).click(),
        secondDialog.getByRole("button", { name: "Register Entries" }).click(),
      ]);
      await Promise.all([
        waitForSubmissionSettled(firstDialog, "Register Entries"),
        waitForSubmissionSettled(secondDialog, "Register Entries"),
      ]);

      const state = await waitForEntryCount("admin", 1);
      expect(state.entries).toHaveLength(1);
      expect(state.members).toHaveLength(1);
    } finally {
      await secondPage.close();
      await page.goto("about:blank");
      await fixture("cleanup", "admin");
    }
  });
});
