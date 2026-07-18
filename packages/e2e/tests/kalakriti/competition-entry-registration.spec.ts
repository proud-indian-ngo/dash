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
});
