import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";
import { registrationCleanup } from "../../helpers/registration-cleanup";
import { KalakritiStudentsPage } from "../../pages/kalakriti-students-page";
import { ListPage } from "../../pages/list-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-students.ts"
);

interface StudentState {
  audits: Array<{ action: string }>;
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
    const setup = await fixture<{ year: number; centerName: string }>(
      "setup",
      superAdminEmail,
      5
    );
    const studentsPage = new KalakritiStudentsPage(page);

    let primaryFailed = false;
    try {
      await studentsPage.goto(setup.year);
      const registrationDialog = await studentsPage.openRegistrationForm(
        setup.centerName
      );
      await studentsPage.fillStudent(registrationDialog, {
        birthYear: "2010",
        name: "Ananya Rao",
      });
      await registrationDialog
        .getByRole("button", { name: "Register Student" })
        .click();
      await expect(
        registrationDialog
          .getByRole("alert")
          .getByText("Date of birth does not match an Age Category", {
            exact: true,
          })
      ).toBeVisible();
      await studentsPage.selectBirthDate(registrationDialog, {
        birthDay: "15",
        birthMonth: "Jun",
        birthYear: "2018",
      });
      await registrationDialog
        .getByRole("button", { name: "Register Student" })
        .click();
      await expect(registrationDialog).toBeHidden();
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
      await expect(editDialog.getByLabel("Student name")).toHaveValue(
        "Ananya Rao"
      );
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

      const duplicateDialog = await studentsPage.openRegistrationForm(
        setup.centerName
      );
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

      const list = new ListPage(page);
      const originalStudent = list.getRowByText("KAL-2026-0001");
      await expect(originalStudent).toHaveCount(1);
      await list.openRowActionAndClick(originalStudent, "Delete");
      await page
        .getByRole("alertdialog", { name: "Delete Student", exact: true })
        .getByRole("button", { name: "Delete Student" })
        .click();
      await expect(
        page.getByText("Student deleted", { exact: true })
      ).toBeVisible();

      const state = await waitForStudentCount(1);
      expect(state.students).toEqual([
        { humanId: "KAL-2026-0002", name: "Ananya Rao Updated" },
      ]);
      expect(state.nextStudentSequence).toBe(3);
      expect(state.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(["created", "updated", "deleted"])
      );
    } catch (error) {
      primaryFailed = true;
      throw error;
    } finally {
      await registrationCleanup(
        [
          async () => {
            if (!page.isClosed())
              await page.goto("about:blank", { timeout: 5000 });
          },
          () => fixture("cleanup"),
        ],
        primaryFailed,
        testInfo
      );
    }
  });

  test("serializes concurrent registrations at the shared Center limit", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Super-admin Student limit race flow"
    );
    test.slow();
    const setup = await fixture<{ year: number; centerName: string }>(
      "setup",
      superAdminEmail,
      1
    );
    const secondPage = await page.context().newPage();
    const firstStudentsPage = new KalakritiStudentsPage(page);
    const secondStudentsPage = new KalakritiStudentsPage(secondPage);

    let primaryFailed = false;
    try {
      await Promise.all([
        firstStudentsPage.goto(setup.year),
        secondStudentsPage.goto(setup.year),
      ]);
      const [firstDialog, secondDialog] = await Promise.all([
        firstStudentsPage.openRegistrationForm(setup.centerName),
        secondStudentsPage.openRegistrationForm(setup.centerName),
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
      expect(state.nextStudentSequence).toBe(2);
    } catch (error) {
      primaryFailed = true;
      throw error;
    } finally {
      await registrationCleanup(
        [
          async () => {
            if (!secondPage.isClosed()) await secondPage.close();
          },
          async () => {
            if (!page.isClosed())
              await page.goto("about:blank", { timeout: 5000 });
          },
          () => fixture("cleanup"),
        ],
        primaryFailed,
        testInfo
      );
    }
  });
});
