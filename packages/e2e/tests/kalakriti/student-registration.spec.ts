import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";
import { KalakritiStudentsPage } from "../../pages/kalakriti-students-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-students.ts"
);

interface StudentState {
  audits: Array<{ action: string }>;
  credentials: Array<{
    humanId: string;
    revokedAt: string | null;
    tokenHash: string;
  }>;
  nextStudentSequence: number | null;
  students: Array<{ humanId: string; name: string }>;
}

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  email?: string,
  femaleLimit?: number
) {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      helperPath,
      action,
      ...(email ? [email] : []),
      ...(femaleLimit === undefined ? [] : [String(femaleLimit)]),
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

async function waitForStudentCount(expected: number): Promise<StudentState> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    // biome-ignore lint/performance/noAwaitInLoops: polling must observe each committed state before retrying
    const state = await fixture<StudentState>("state");
    if (state.students.length === expected) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${expected} Student records`);
}

test.describe("Kalakriti Student registration", () => {
  test.describe.configure({ mode: "serial" });

  test("registers, confirms a duplicate, edits, and hard-deletes Students", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Super-admin Student registration flow"
    );
    test.slow();
    const setup = await fixture<{ year: number }>("setup", superAdminEmail, 5);
    const studentsPage = new KalakritiStudentsPage(page);

    try {
      await studentsPage.goto(setup.year);
      await studentsPage.register("Ananya Rao");
      await expect(
        page.getByText("Student registered", { exact: true }).last()
      ).toBeVisible();
      await expect(
        page.getByText("KAL-2026-0001", { exact: true })
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Actions for Ananya Rao" })
        .click();
      await page.getByRole("menuitem", { name: "Edit" }).click();
      const editDialog = page.getByRole("dialog", { name: "Edit Student" });
      await editDialog.getByLabel("Student name").fill("Ananya Rao Updated");
      await editDialog.getByRole("button", { name: "Save Student" }).click();
      await expect(editDialog).toBeHidden();
      await expect(
        page.getByText("Student updated", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("KAL-2026-0001", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("Ananya Rao Updated", { exact: true })
      ).toBeVisible();

      const duplicateDialog = await studentsPage.openRegistrationForm();
      await studentsPage.fillStudent(duplicateDialog, {
        name: "  Ananya   Rao Updated  ",
      });
      await expect(
        duplicateDialog.getByText(
          /has the same normalized name and date of birth/
        )
      ).toBeVisible();
      await duplicateDialog
        .getByRole("checkbox", {
          name: /I have reviewed this possible duplicate/,
        })
        .click();
      await duplicateDialog
        .getByRole("button", { name: "Register Student" })
        .click();
      await expect(duplicateDialog).toBeHidden();
      await expect(
        page.getByText("Student registered", { exact: true }).last()
      ).toBeVisible();
      await expect(
        page.getByText("KAL-2026-0002", { exact: true })
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Actions for Ananya Rao Updated" })
        .first()
        .click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page
        .getByRole("alertdialog", { name: "Delete Student?" })
        .getByRole("button", { name: "Delete Student" })
        .click();
      await expect(
        page.getByText("Student deleted", { exact: true })
      ).toBeVisible();

      const state = await waitForStudentCount(1);
      expect(state.students).toEqual([
        { humanId: "KAL-2026-0002", name: "Ananya Rao Updated" },
      ]);
      expect(state.credentials).toHaveLength(1);
      expect(state.credentials[0]).toMatchObject({
        humanId: "KAL-2026-0002",
        revokedAt: null,
      });
      expect(state.credentials[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(state.nextStudentSequence).toBe(3);
      expect(state.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(["created", "updated", "deleted"])
      );
    } finally {
      await fixture("cleanup");
    }
  });

  test("serializes concurrent registrations at the Center quota", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Super-admin quota race flow"
    );
    test.slow();
    const setup = await fixture<{ year: number }>("setup", superAdminEmail, 1);
    const secondPage = await page.context().newPage();
    const firstStudentsPage = new KalakritiStudentsPage(page);
    const secondStudentsPage = new KalakritiStudentsPage(secondPage);

    try {
      await Promise.all([
        firstStudentsPage.goto(setup.year),
        secondStudentsPage.goto(setup.year),
      ]);
      const [firstDialog, secondDialog] = await Promise.all([
        firstStudentsPage.openRegistrationForm(),
        secondStudentsPage.openRegistrationForm(),
      ]);
      await Promise.all([
        firstStudentsPage.fillStudent(firstDialog, { name: "Race Student A" }),
        secondStudentsPage.fillStudent(secondDialog, {
          name: "Race Student B",
        }),
      ]);
      await Promise.all([
        firstDialog.getByRole("button", { name: "Register Student" }).click(),
        secondDialog.getByRole("button", { name: "Register Student" }).click(),
      ]);

      const state = await waitForStudentCount(1);
      expect(state.students).toHaveLength(1);
      expect(state.credentials).toHaveLength(1);
      expect(state.nextStudentSequence).toBe(2);
    } finally {
      await secondPage.close();
      await fixture("cleanup");
    }
  });
});
