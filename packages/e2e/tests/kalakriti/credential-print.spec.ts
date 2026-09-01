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
  credentials: Array<{
    humanId: string;
    revokedAt: string | null;
    tokenHash: string;
  }>;
}

async function fixture<T>(
  action: "cleanup" | "setup" | "state",
  email?: string
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(email ? [email] : [])],
    { env: process.env }
  );
  if (action === "cleanup") {
    return undefined as T;
  }
  return JSON.parse(stdout.trim()) as T;
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
      expect(printResponse.headers()["content-type"]).toContain(
        "application/pdf"
      );
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
