import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-credentials.ts"
);

interface CredentialState {
  audits: Array<{ action: string }>;
  credentials: Array<{
    humanId: string;
    membershipId: string | null;
    revokedAt: string | null;
    tokenHash: string;
  }>;
}

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
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

test.describe("Kalakriti credential print", () => {
  test.describe.configure({ mode: "serial" });

  test("prints, reissues, and looks up credentials", async ({
    page,
    superAdminEmail,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_phase2",
      "Super-admin credential print flow"
    );
    test.slow();
    const setup = await fixture<{
      humanId: string;
      membershipId: string;
      studentId: string;
      year: number;
    }>("setup", superAdminEmail);

    try {
      const before = await fixture<CredentialState>("state");
      expect(before.credentials).toHaveLength(1);

      const printResponse = await page.request.post(
        `/api/kalakriti/${setup.year}/credentials/print`,
        {
          data: { subjects: [{ studentId: setup.studentId }] },
        }
      );
      const contentType = printResponse.headers()["content-type"] ?? "";
      if (!contentType.includes("application/pdf")) {
        const body = await printResponse.text();
        throw new Error(
          `Print returned ${printResponse.status()} ${contentType}. Body: ${body.slice(0, 500)}`
        );
      }
      expect(contentType).toContain("application/pdf");
      const afterPrint = await fixture<CredentialState>("state");
      expect(afterPrint.credentials).toHaveLength(2);
      expect(
        afterPrint.credentials.filter((row) => row.revokedAt)
      ).toHaveLength(1);
      expect(
        afterPrint.credentials.find((row) => row.revokedAt === null)?.tokenHash
      ).not.toBe(before.credentials[0]?.tokenHash);

      const lookupResponse = await page.request.get(
        `/api/kalakriti/${setup.year}/credentials/lookup?humanId=${encodeURIComponent(setup.humanId)}`
      );
      expect(lookupResponse.ok()).toBe(true);
      const lookup = await lookupResponse.json();
      expect(lookup).toMatchObject({
        humanId: setup.humanId,
        kind: "student",
        name: "Credential Student",
      });
      expect(lookup.tokenHash).toBeUndefined();
      expect(lookup.token).toBeUndefined();

      await page.goto(`/kalakriti/${setup.year}/credentials`);
      const volunteerRow = page
        .getByRole("row")
        .filter({ hasText: "Credential Volunteer" });
      await expect(volunteerRow).toContainText("Not issued");
      await volunteerRow
        .getByRole("button", { name: "Actions for Credential Volunteer" })
        .click();
      await page
        .getByRole("menuitem", { name: "Print card", exact: true })
        .click();
      const printRoute = `**/api/kalakriti/${setup.year}/credentials/print`;
      let abortPrint = true;
      await page.route(printRoute, async (route) => {
        if (abortPrint) {
          abortPrint = false;
          await route.abort("failed");
          return;
        }
        await route.continue();
      });
      const printDialog = page.getByRole("alertdialog", {
        name: "Print credential cards?",
      });
      const confirmPrint = printDialog.getByRole("button", {
        name: "Print cards",
        exact: true,
      });
      await confirmPrint.click();
      await expect(page.getByText("Failed to print credentials")).toBeVisible();
      await expect(printDialog).toBeVisible();
      await expect(confirmPrint).toBeEnabled();

      const download = page.waitForEvent("download");
      await confirmPrint.click();
      expect((await download).suggestedFilename()).toBe(
        `kalakriti-${setup.year}-credentials.pdf`
      );
      await page.unroute(printRoute);
      await expect(volunteerRow).toContainText(`KALV-${setup.year}-0001`);
      await page.getByLabel("Lookup yearly ID").fill(`KALV-${setup.year}-0001`);
      await page.getByRole("button", { name: "Look up", exact: true }).click();
      await expect(
        page
          .getByText("Issued", { exact: false })
          .filter({ hasText: "Issued " })
          .last()
      ).toBeVisible();
      const afterVolunteer = await fixture<CredentialState>("state");
      expect(
        afterVolunteer.credentials.filter(
          (row) => row.membershipId === setup.membershipId && !row.revokedAt
        )
      ).toHaveLength(1);
      expect(
        afterVolunteer.audits.filter((row) => row.action === "printed")
      ).toHaveLength(2);

      const duplicate = await page.request.post(
        `/api/kalakriti/${setup.year}/credentials/print`,
        {
          data: {
            subjects: [
              { membershipId: setup.membershipId },
              { membershipId: setup.membershipId },
            ],
          },
        }
      );
      expect(duplicate.status()).toBe(400);
      const malformed = await page.request.post(
        `/api/kalakriti/${setup.year}/credentials/print`,
        {
          data: "{",
          headers: { "Content-Type": "application/json" },
        }
      );
      expect(malformed.status()).toBe(400);
      const invalidBatch = await page.request.post(
        `/api/kalakriti/${setup.year}/credentials/print`,
        {
          data: {
            subjects: [
              { studentId: setup.studentId },
              { membershipId: "019f0000-0000-7000-8000-00000000ffff" },
            ],
          },
        }
      );
      expect(invalidBatch.status()).toBe(404);
      expect(await fixture<CredentialState>("state")).toEqual(afterVolunteer);
    } finally {
      await fixture("cleanup");
    }
  });

  test("denies Guardian and Liaison direct credential URLs", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_phase2",
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
        await rolePage.goto(`/kalakriti/${year}/credentials`);
        await expect(
          rolePage.getByRole("heading", { name: "Page not found" })
        ).toBeVisible();
        expect(
          (
            await context.request.get(
              `/api/kalakriti/${year}/credentials/lookup?humanId=KAL-${year}-0001`
            )
          ).status()
        ).toBe(404);
      } finally {
        await context.close();
      }
    }
  });
});
