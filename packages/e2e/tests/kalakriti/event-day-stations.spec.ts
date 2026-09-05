import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const YEAR = 2186;
const ASSIGNED_STUDENT_ID = "KAL-2186-0001";
const execFileAsync = promisify(execFile);

async function volunteerSubject(): Promise<{
  humanId: string | null;
  id: string;
}> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(
        import.meta.dirname,
        "../../helpers/kalakriti-station-subject.ts"
      ),
    ],
    { env: process.env }
  );
  return JSON.parse(stdout);
}

test.describe("Kalakriti event-day stations", () => {
  test.describe.configure({ mode: "serial" });

  test("records transport, meals, attendance, and volunteer check-in", async ({
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
      page.getByText(/Operation recorded|Already recorded/)
    ).toBeVisible();
    await expect(
      page.getByText(/Operation recorded|Already recorded/)
    ).toHaveCount(0);

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Meals" }).click();
    await page.getByLabel("Meal").click();
    await page.getByRole("option", { name: "Breakfast" }).click();
    await page.getByLabel("Yearly ID").fill(ASSIGNED_STUDENT_ID);
    await page.getByRole("button", { name: "Record meal" }).click();
    await expect(page.getByText("Operation recorded")).toBeVisible();
    await expect(page.getByText("Operation recorded")).toHaveCount(0);

    await page.getByLabel("Meal").click();
    await page.getByRole("option", { name: "Lunch", exact: true }).click();
    await page
      .getByRole("button", { name: "Record meal", exact: true })
      .click();
    await expect(page.getByText("Operation recorded")).toBeVisible();
    await expect(page.getByText("Operation recorded")).toHaveCount(0);

    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Attendance", exact: true }).click();
    await page.getByLabel("Competition session").click();
    await page.getByRole("option", { name: /Solo Dance/ }).click();
    await page
      .getByRole("button", { name: "Record attendance", exact: true })
      .click();
    await expect(page.getByText("Operation recorded")).toBeVisible();
    await expect(page.getByText("Operation recorded")).toHaveCount(0);

    const volunteer = await volunteerSubject();
    const printed = await page.request.post(
      `/api/kalakriti/${YEAR}/credentials/print`,
      {
        data: { subjects: [{ membershipId: volunteer.id }] },
      }
    );
    expect(printed.headers()["content-type"]).toContain("application/pdf");
    const issued = await volunteerSubject();
    expect(issued.humanId).toMatch(/^KALV-2186-/);
    await page.getByLabel("Station").click();
    await page.getByRole("option", { name: "Check-in", exact: true }).click();
    await page.getByLabel("Yearly ID").fill(issued.humanId ?? "");
    await page
      .getByRole("button", { name: "Record check-in", exact: true })
      .click();
    await expect(page.getByText("Operation recorded")).toBeVisible();
    await expect(page.getByText("Operation recorded")).toHaveCount(0);
  });
});
