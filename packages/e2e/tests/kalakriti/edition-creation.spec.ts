import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";
import { KalakritiEditionPage } from "../../pages/kalakriti-edition-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-edition-creation.ts"
);
const YEAR = 2094;

async function fixture<T>(action: "cleanup" | "state") {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as T;
}

test("creates an Edition and its protected linked event atomically", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Edition creation flow"
  );
  test.slow();
  await fixture("cleanup");
  const editionPage = new KalakritiEditionPage(page);

  try {
    await editionPage.create({ name: `Kalakriti ${YEAR}`, year: YEAR });
    const state = await fixture<{
      editionId: string;
      eventName: string;
      managementDomain: string;
      name: string;
      teamEventId: string;
      year: number;
    }>("state");
    expect(state).toMatchObject({
      eventName: `Kalakriti ${YEAR}`,
      managementDomain: "kalakriti",
      name: `Kalakriti ${YEAR}`,
      year: YEAR,
    });
    expect(state.editionId).not.toBe(state.teamEventId);
  } finally {
    await fixture("cleanup");
  }
});
