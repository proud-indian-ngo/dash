import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;
const ASSIGNED_STUDENT_ID = "KAL-2186-0001";

test.describe("Kalakriti event-day transport", () => {
  test.describe.configure({ mode: "serial" });

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
      page.getByText("Online-only transport station", { exact: false })
    ).toBeVisible();

    await page.getByLabel("Yearly ID").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expect(page.getByText("Transport recorded")).toBeVisible();

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
