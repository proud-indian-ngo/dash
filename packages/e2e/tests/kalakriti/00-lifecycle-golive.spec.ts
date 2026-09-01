import { expect, test, waitForZeroReady } from "../../fixtures/test";
import {
  expectKalakritiToast,
  prepareKalakriti2186EventDay,
  runKalakritiGoliveFixture,
  waitForKalakritiLifecycle,
} from "../../helpers/kalakriti-e2e-fixture";

const YEAR = 2186;
const ASSIGNED_STUDENT_ID = "KAL-2186-0001";

test.describe("Kalakriti go-live", () => {
  test.describe.configure({ mode: "serial" });

  test("shows go-live blockers before the Edition can go live", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_phase2",
      "Kalakriti go-live blockers"
    );
    test.slow();

    await runKalakritiGoliveFixture("invalidate-go-live");
    await expect(async () => {
      await page.goto(`/kalakriti/${YEAR}`);
      await waitForZeroReady(page);
      await expect(
        page.getByText("Every Center must have registration controls disabled")
      ).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Go live" })).toBeDisabled();
  });

  test("transitions a ready locked Edition to live", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_phase2",
      "Kalakriti go-live transition"
    );
    test.slow();

    await runKalakritiGoliveFixture("lock-2186");
    await waitForKalakritiLifecycle(page, YEAR, "registration_locked");
    await page.getByRole("button", { name: "Go live" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Go live?" });
    await dialog.getByRole("button", { name: "Go live" }).click();
    await expectKalakritiToast(page, "Edition is now live");
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
      testInfo.project.name !== "kalakriti_phase2",
      "Kalakriti correction eligibility"
    );
    test.slow();

    await prepareKalakriti2186EventDay(page);
    await page.goto(`/kalakriti/${YEAR}/event-day`);
    await waitForZeroReady(page);

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Transport" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expectKalakritiToast(page, "Operation recorded");

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expectKalakritiToast(page, "Operation recorded");

    await page.locator("#correct-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Look up" }).click();
    await page.getByLabel("Reason").fill("Wrong pickup time recorded");
    await expect(async () => {
      await page.getByRole("button", { name: "Correct operation" }).click();
      await expectKalakritiToast(page, "Operation corrected");
    }).toPass({ timeout: 30_000 });

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expectKalakritiToast(page, /Operation recorded|Already recorded/);
  });

  test("still denies guardians on event-day transport", async ({
    baseURL,
    browser,
    kalakritiActors,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_phase2",
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
      testInfo.project.name !== "kalakriti_phase2",
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
