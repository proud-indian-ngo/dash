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

test("creates and updates an Edition with its protected linked event", async ({
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
    await editionPage.editDetails({
      name: `Kalakriti ${YEAR} Revised`,
      year: YEAR,
    });
    const state = await fixture<{
      ageCutoffDate: string;
      brandingKey: string;
      editionId: string;
      eventDate: string;
      eventName: string;
      eventStartTime: string;
      managementDomain: string;
      name: string;
      plannedRegistrationCloseAt: string;
      teamEventId: string;
      year: number;
    }>("state");
    expect(state).toMatchObject({
      ageCutoffDate: `${YEAR}-06-30`,
      brandingKey: `kalakriti-${YEAR}-updated`,
      eventDate: `${YEAR}-11-21`,
      eventName: `Kalakriti ${YEAR} Revised`,
      eventStartTime: `${YEAR}-11-20T18:30:00.000Z`,
      managementDomain: "kalakriti",
      name: `Kalakriti ${YEAR} Revised`,
      plannedRegistrationCloseAt: `${YEAR}-10-31T12:30:00.000Z`,
      year: YEAR,
    });
    expect(state.editionId).not.toBe(state.teamEventId);
  } finally {
    await fixture("cleanup");
  }
});
