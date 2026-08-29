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

test.describe("Kalakriti event-day stations", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await fixture("prepare-2186-event-day");
  });

  test("records breakfast after pickup on the meals station", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti event-day meals workflow"
    );
    test.slow();

    await page.goto(`/kalakriti/${YEAR}/event-day`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Event day" })
    ).toBeVisible();

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Transport" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expect(
      page.getByText(/Operation recorded|Already recorded/)
    ).toBeVisible();

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.getByLabel("Meal").click();
    await page.getByRole("option", { name: "Breakfast" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expect(page.getByText("Operation recorded")).toBeVisible();
  });
});
