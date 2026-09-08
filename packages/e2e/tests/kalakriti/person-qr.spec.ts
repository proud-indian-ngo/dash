import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";
import { KalakritiPersonQrPage } from "../../pages/kalakriti-person-qr-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-person-qr.ts"
);

interface PersonState {
  audits: Array<{ action: string }>;
}

async function fixture<T>(
  action: "cleanup" | "setup" | "setup-yearly-ids" | "state",
  email?: string
) {
  let stdout = "";
  let stderr = "";
  try {
    ({ stdout, stderr } = await execFileAsync(
      "bun",
      ["run", helperPath, action, ...(email ? [email] : [])],
      { env: process.env }
    ));
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    throw new Error(
      `credential fixture (${action}) failed. stdout: ${err.stdout?.slice(0, 400) || "(empty)"} stderr: ${err.stderr?.slice(0, 400) || "(empty)"}`,
      { cause: error }
    );
  }
  if (action === "cleanup") {
    return undefined as T;
  }
  if (!stdout.trim()) {
    throw new Error(
      `credential fixture (${action}) exited 0 with empty stdout. stderr: ${stderr.slice(0, 400)}`
    );
  }
  try {
    return JSON.parse(stdout.trim()) as T;
  } catch {
    throw new Error(
      `credential fixture (${action}) returned unparseable output: ${stdout.slice(0, 200)}`
    );
  }
}

test.describe("Kalakriti person QR", () => {
  test.describe.configure({ mode: "serial" });

  test("detail sheets automatically show stable person IDs without issuing credentials", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin person sheets");
    test.slow();
    const setup = await fixture<{
      year: number;
      studentId: string;
      membershipId: string;
      guardianId: string;
    }>("setup", superAdminEmail);
    const sheets = new KalakritiPersonQrPage(page);
    try {
      const initial = await fixture<PersonState>("state");
      for (const subject of [
        {
          path: "students",
          type: "student",
          name: "Credential Student",
          id: setup.studentId,
        },
        {
          path: "volunteers",
          type: "volunteer",
          name: "Credential Volunteer",
          id: setup.membershipId,
        },
        {
          path: "guardians",
          type: "guardian",
          name: "Credential Guardian",
          id: setup.guardianId,
        },
      ] as const) {
        const sheet = await sheets.open(setup.year, subject.path, subject.name);
        if (subject.path !== "volunteers") {
          await expect(
            sheet.getByRole("heading", { name: "Center details" })
          ).toBeVisible();
          await expect(
            sheet.getByText("Jayanagar", { exact: true })
          ).toBeVisible();
        }
        if (subject.path === "students") {
          await expect(
            sheet.getByRole("heading", { name: "Competitions", exact: true })
          ).toBeVisible();
          await expect(
            sheet.getByRole("listitem").filter({ hasText: "Solo Singing" })
          ).toContainText("Individual");
          await expect(
            sheet.getByRole("listitem").filter({ hasText: "Group Dance" })
          ).toContainText("Group");
        }
        await expect(
          sheet
            .getByRole("region", { name: "Person QR code" })
            .getByText(subject.id, { exact: true })
        ).toHaveCount(0);
        expect(JSON.parse(await sheets.decodeQr(sheet))).toEqual({
          id: subject.id,
          type: subject.type,
        });
        await expect(
          sheet.getByRole("button", { name: /Issue QR|Replace QR|Reissue/ })
        ).toHaveCount(0);
        expect(await fixture<PersonState>("state")).toEqual(initial);
        await sheet.getByRole("button", { name: "Close", exact: true }).click();
        const reopened = await sheets.open(
          setup.year,
          subject.path,
          subject.name
        );
        expect(JSON.parse(await sheets.decodeQr(reopened))).toEqual({
          id: subject.id,
          type: subject.type,
        });
        expect(await fixture<PersonState>("state")).toEqual(initial);
        await reopened
          .getByRole("button", { name: "Close", exact: true })
          .click();
      }
      await expect(
        page.getByRole("link", { name: "Credentials", exact: true })
      ).toHaveCount(0);
      await page.goto(`/kalakriti/${setup.year}/credentials`);
      await expect(
        page.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
    } finally {
      await fixture("cleanup");
    }
  });

  test("Kalakriti volunteers show only their Edition yearly ID and a dash when missing", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Edition volunteer yearly IDs"
    );
    const setup = await fixture<{ year: number }>(
      "setup-yearly-ids",
      superAdminEmail
    );
    try {
      await page.goto(`/kalakriti/${setup.year}/volunteers`);
      const search = page.getByPlaceholder("Search volunteers...");
      await search.fill(`KALV-${setup.year}-0001`);
      await expect(
        page.getByRole("columnheader", { name: "Yearly ID" })
      ).toBeVisible();
      const multiYear = page
        .getByRole("row")
        .filter({ hasText: "QR Multi Year Volunteer" });
      await expect(multiYear).toContainText(`KALV-${setup.year}-0001`);
      await expect(multiYear).not.toContainText(`KALV-${setup.year - 1}-0007`);
      await expect(multiYear).not.toContainText("Morning team");
      await expect(
        page.getByRole("columnheader", { name: "Group" })
      ).toHaveCount(0);
      await search.fill("Morning team");
      await expect(multiYear).toBeVisible();
      const ids = multiYear
        .getByRole("cell")
        .filter({ hasText: `KALV-${setup.year}-0001` });
      await expect(ids).toHaveText(`KALV-${setup.year}-0001`);
      const columnIndex = await ids.evaluate((cell) =>
        Array.from(cell.parentElement!.children).indexOf(cell)
      );
      await search.fill("QR No Year Volunteer");
      const noYear = page
        .getByRole("row")
        .filter({ hasText: "QR No Year Volunteer" });
      await expect(noYear.getByRole("cell").nth(columnIndex)).toHaveText("—");
      await page.goto("/users");
      await expect(
        page.getByRole("columnheader", { name: "Volunteer yearly IDs" })
      ).toHaveCount(0);
      await expect(
        page.getByRole("columnheader", { name: "Yearly ID", exact: true })
      ).toHaveCount(0);
    } finally {
      await page.goto("about:blank");
      await fixture("cleanup");
    }
  });

  test("looks up people without credentials and removes legacy print", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Admin identifier lookup"
    );
    const setup = await fixture<{
      humanId: string;
      membershipId: string;
      guardianId: string;
      year: number;
    }>("setup", superAdminEmail);
    try {
      const before = await fixture<PersonState>("state");
      for (const subject of [
        { id: setup.humanId, kind: "student", name: "Credential Student" },
        {
          id: setup.membershipId,
          kind: "volunteer",
          name: "Credential Volunteer",
        },
        { id: setup.guardianId, kind: "guardian", name: "Credential Guardian" },
      ]) {
        const response = await page.request.get(
          `/api/kalakriti/${setup.year}/people/lookup?humanId=${subject.id}`
        );
        expect(response.ok()).toBe(true);
        expect(await response.json()).toMatchObject({
          humanId: subject.id,
          kind: subject.kind,
          name: subject.name,
        });
      }
      expect(await fixture<PersonState>("state")).toEqual(before);
      expect(
        (
          await page.request.post(
            `/api/kalakriti/${setup.year}/credentials/print`,
            { data: { subjects: [{ membershipId: setup.membershipId }] } }
          )
        ).status()
      ).toBe(404);
      expect(
        (
          await page.request.get(
            `/api/kalakriti/${setup.year}/credentials/lookup?humanId=${setup.humanId}`
          )
        ).status()
      ).toBe(404);
    } finally {
      await fixture("cleanup");
    }
  });

  test("shows scoped person QR to Guardian and Liaison while denying credential APIs", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Credential authorization boundaries"
    );
    const year = 2186;
    for (const actor of [kalakritiActors.guardian, kalakritiActors.liaison]) {
      // biome-ignore lint/performance/noAwaitInLoops: browser contexts must close sequentially
      const context = await browser.newContext({
        baseURL,
        storageState: actor.storageState,
      });
      const rolePage = await context.newPage();
      try {
        const sheets = new KalakritiPersonQrPage(rolePage);
        const student = await sheets.open(year, "students", "Assigned Student");
        await expect(
          student.getByRole("heading", { name: "Center details" })
        ).toBeVisible();
        const decoded = await sheets.decodeQr(student);
        expect(JSON.parse(decoded)).toEqual({
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          ),
          type: "student",
        });
        await expect(
          student.getByRole("button", { name: /Issue QR|Replace QR|Reissue/ })
        ).toHaveCount(0);
        await student
          .getByRole("button", { name: "Close", exact: true })
          .click();
        await expect(
          rolePage.getByRole("button", { name: "Outside Student", exact: true })
        ).toHaveCount(0);
        const reopened = await sheets.open(
          year,
          "students",
          "Assigned Student"
        );
        expect(await sheets.decodeQr(reopened)).toBe(decoded);
        expect(
          (
            await context.request.post(
              `/api/kalakriti/${year}/credentials/print`,
              {
                data: {
                  subjects: [
                    { studentId: "019f0000-0000-7000-8000-00000000ffff" },
                  ],
                },
              }
            )
          ).status()
        ).toBe(404);
        await rolePage.goto(`/kalakriti/${year}/credentials`);
        await expect(
          rolePage.getByRole("heading", { name: "Page not found" })
        ).toBeVisible();
        expect(
          (
            await context.request.get(
              `/api/kalakriti/${year}/people/lookup?humanId=KAL-${year}-0001`
            )
          ).status()
        ).toBe(404);
      } finally {
        await context.close();
      }
    }
  });
});
