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

test.describe("Kalakriti go-live", () => {
  test.describe.configure({ mode: "serial" });

  test("shows go-live blockers before the Edition can go live", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti go-live blockers"
    );
    test.slow();

    await fixture("invalidate-go-live");
    await page.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(page);
    await expect(
      page.getByText("Every Center must have registration controls disabled")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Go live" })).toBeDisabled();
  });

  test("transitions a ready locked Edition to live", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti go-live transition"
    );
    test.slow();

    await fixture("lock-2186");
    await page.goto(`/kalakriti/${YEAR}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Go live" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Go live?" });
    await dialog.getByRole("button", { name: "Go live" }).click();
    await expect(
      page.getByText("Edition is now live", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Event-day operations are enabled. Registration remains closed."
      )
    ).toBeVisible();
  });

  test("correction keeps meal eligibility after pickup is corrected", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti correction eligibility"
    );
    test.slow();

    await fixture("prepare-2186-event-day");
    await page.goto(`/kalakriti/${YEAR}/event-day`);
    await waitForZeroReady(page);

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Transport" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expect(page.getByText("Operation recorded")).toBeVisible();

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expect(page.getByText("Operation recorded")).toBeVisible();

    await page.locator("#correct-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Look up" }).click();
    await page.getByLabel("Reason").fill("Wrong pickup time recorded");
    await page.getByRole("button", { name: "Correct operation" }).click();
    await expect(page.getByText("Operation corrected")).toBeVisible();

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expect(
      page.getByText(/Operation recorded|Already recorded/)
    ).toBeVisible();
  });

  test("still denies guardians on event-day transport", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti guardian go-live boundary"
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
    } finally {
      await guardianContext.close();
    }
  });

  test("keeps Results, Awards, and Inventory routes unavailable", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "Kalakriti deferred module routes"
    );

    for (const routePath of ["results", "awards", "inventory"]) {
      // biome-ignore lint/performance/noAwaitInLoops: route checks are intentionally serial
      await page.goto(`/kalakriti/${YEAR}/${routePath}`);
      await expect(
        page.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
    }
  });
});
