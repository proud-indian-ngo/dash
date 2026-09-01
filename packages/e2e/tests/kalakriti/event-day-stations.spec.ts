import { expect, test, waitForZeroReady } from "../../fixtures/test";
import {
  expectKalakritiToast,
  prepareKalakriti2186EventDay,
} from "../../helpers/kalakriti-e2e-fixture";

const YEAR = 2186;
const ASSIGNED_STUDENT_ID = "KAL-2186-0001";

test.describe("Kalakriti event-day stations", () => {
  test.describe.configure({ mode: "serial" });

  test("records breakfast after pickup on the meals station", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "kalakriti_phase2",
      "Kalakriti event-day meals workflow"
    );
    test.slow();

    await prepareKalakriti2186EventDay(page);
    await page.goto(`/kalakriti/${YEAR}/event-day`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Event day" })
    ).toBeVisible();

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Transport" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expectKalakritiToast(page, /Operation recorded|Already recorded/);

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.getByLabel("Meal").click();
    await page.getByRole("option", { name: "Breakfast" }).click();
    await page.locator("#event-day-human-id").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expectKalakritiToast(page, "Operation recorded");
  });
});
