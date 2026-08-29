import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-golive.ts"
);

async function fixture<T>(action: string) {
  const { stdout } = await execFileAsync("bun", ["run", helperPath, action], {
    env: process.env,
    killSignal: "SIGKILL",
    timeout: 30_000,
  });
  return JSON.parse(stdout.trim()) as T;
}

const YEAR = 2186;
const ASSIGNED_STUDENT_ID = "KAL-2186-0001";

test.describe("Kalakriti event-day transport", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await fixture("prepare-2186-event-day");
  });

  test("records pickup via manual yearly ID and treats duplicates as no-ops", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti event-day transport workflow"
    );
    test.slow();

    await page.goto(`/kalakriti/${YEAR}/event-day`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Event day" })
    ).toBeVisible();
    await expect(
      page.getByText("Online-only event-day stations", { exact: false })
    ).toBeVisible();

    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expect(page.getByText("Operation recorded")).toBeVisible();

    await page.getByRole("button", { name: "Record transport" }).click();
    await expect(page.getByText("Already recorded")).toBeVisible();
  });

  test("returns 404 for guardians on the event-day route", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti guardian event-day boundary"
    );

    const guardianContext = await browser.newContext({
      baseURL,
      storageState: kalakritiActors.guardian.storageState,
    });
    const guardianPage = await guardianContext.newPage();
    try {
      await guardianPage.goto(`/kalakriti/${YEAR}/event-day`);
      await expect(
        guardianPage.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
      await expect(
        guardianPage.getByRole("link", { name: "Event day" })
      ).toHaveCount(0);
    } finally {
      await guardianContext.close();
    }
  });
});
