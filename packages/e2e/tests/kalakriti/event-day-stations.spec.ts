import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;
const ASSIGNED_STUDENT_ID = "KAL-2186-0001";

test.describe("Kalakriti event-day stations", () => {
  test.describe.configure({ mode: "serial" });

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
    await page.getByLabel("Yearly ID").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record transport" }).click();
    await expect(
      page.getByText(/Transport recorded|Already recorded/)
    ).toBeVisible();

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.getByLabel("Meal").click();
    await page.getByRole("option", { name: "Breakfast" }).click();
    await page.getByLabel("Yearly ID").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expect(page.getByText("Operation recorded")).toBeVisible();
  });
});
