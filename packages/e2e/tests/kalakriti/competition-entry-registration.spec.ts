import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";
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
  email?: string,
  capacity?: number
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      helperPath,
      action,
      kind,
      ...(email ? [email] : []),
      ...(capacity === undefined ? [] : [String(capacity)]),
    ],
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
      volunteerEmail,
      2
    );
    const entriesPage = new KalakritiEntriesPage(page);

    try {
      await entriesPage.goto(year);
      await entriesPage.register("Entry Student A");
      await expect(
        page.getByText("Competition Entry registered", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("Entry Student A", { exact: true })
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Actions for Entry Student A" })
        .click();
      await page.getByRole("menuitem", { name: "Remove Entry" }).click();
      await page
        .getByRole("alertdialog", { name: "Remove Competition Entry?" })
        .getByRole("button", { name: "Remove Entry" })
        .click();
      await expect(
        page.getByText("Competition Entry removed", { exact: true })
      ).toBeVisible();

      const state = await waitForEntryCount("liaison", 0);
      expect(state.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(["created", "deleted"])
      );
    } finally {
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
      volunteerEmail,
      2
    );
    const entriesPage = new KalakritiEntriesPage(page);

    try {
      await entriesPage.goto(year);
      const dialog = await entriesPage.openRegistrationForm();
      await entriesPage.chooseGroupSession(dialog);
      await entriesPage.selectGroupMembers(dialog, ["Entry Student A"]);
      await dialog.getByLabel("Group members").blur();
      await expect(
        dialog.getByText("Select at least 2 Students for this group")
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Register Entry" })
      ).toBeDisabled();

      await entriesPage.selectGroupMembers(dialog, ["Entry Student D"]);
      await expect(
        dialog.getByText(
          `KAL-${year}-0004 · Entry Student D: This Competition is limited to female Students`
        )
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Register Entry" })
      ).toBeDisabled();

      await entriesPage.removeLastGroupMember(dialog);
      await entriesPage.selectGroupMembers(dialog, ["Entry Student B"]);
      await dialog.getByRole("button", { name: "Register Entry" }).click();
      await expect(
        page.getByText("Competition Entry registered", { exact: true })
      ).toBeVisible();
      await expect(
        page.locator("#main").getByText("Entry Student A", { exact: true })
      ).toBeVisible();
      await expect(
        page.locator("#main").getByText("Entry Student B", { exact: true })
      ).toBeVisible();

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
      await fixture("cleanup", "liaison");
    }
  });

  test("serializes concurrent submissions at Session capacity", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Super-admin Entry capacity race"
    );
    test.slow();
    const { year } = await fixture<{ year: number }>(
      "setup",
      "admin",
      superAdminEmail,
      1
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
        secondEntriesPage.fillEntry(secondDialog, "Entry Student B"),
      ]);
      await Promise.all([
        firstDialog.getByRole("button", { name: "Register Entry" }).click(),
        secondDialog.getByRole("button", { name: "Register Entry" }).click(),
      ]);

      const state = await waitForEntryCount("admin", 1);
      expect(state.entries).toHaveLength(1);
    } finally {
      await secondPage.close();
      await fixture("cleanup", "admin");
    }
  });

  test("serializes concurrent group submissions at Session capacity", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Super-admin group Entry capacity race"
    );
    test.slow();
    const { year } = await fixture<{ year: number }>(
      "setup",
      "admin",
      superAdminEmail,
      1
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
        firstEntriesPage.fillGroup(firstDialog, [
          "Entry Student A",
          "Entry Student B",
        ]),
        secondEntriesPage.fillGroup(secondDialog, [
          "Entry Student C",
          "Entry Student D",
        ]),
      ]);
      await Promise.all([
        firstDialog.getByRole("button", { name: "Register Entry" }).click(),
        secondDialog.getByRole("button", { name: "Register Entry" }).click(),
      ]);

      const state = await waitForEntryCount("admin", 1);
      expect(state.entries).toHaveLength(1);
    } finally {
      await secondPage.close();
      await fixture("cleanup", "admin");
    }
  });
});
