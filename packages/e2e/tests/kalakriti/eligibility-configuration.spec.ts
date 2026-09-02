import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiEligibilityPage } from "../../pages/kalakriti-eligibility-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-eligibility.ts"
);

async function fixture<T>(action: string, argument?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("configures Age Categories with shared Center limits", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin eligibility workflow"
  );
  const { year } = await fixture<{ year: number }>("setup", superAdminEmail);
  const eligibility = new KalakritiEligibilityPage(page);

  try {
    await eligibility.goto(year);
    await waitForZeroReady(page);
    await eligibility.addAgeCategory({
      femaleStudentLimit: 25,
      maleStudentLimit: 20,
      maximumAge: 10,
      minimumAge: 6,
      name: "Junior",
      order: 0,
    });
    await expect(eligibility.ageCategory("Junior")).toContainText("6-10 years");
    await expect(eligibility.ageCategory("Junior")).toContainText("20");
    await expect(eligibility.ageCategory("Junior")).toContainText("25");

    await page.getByRole("button", { name: "Add Age Category" }).click();
    const overlapDialog = page.getByRole("dialog", {
      name: "Add Age Category",
    });
    await overlapDialog.getByLabel("Category name").fill("Overlapping");
    await overlapDialog.getByLabel("Minimum age").fill("10");
    await overlapDialog.getByLabel("Maximum age").fill("12");
    await overlapDialog.getByLabel("Display order").fill("1");
    await expect(page.getByText("Age range overlaps Junior")).toBeVisible();
    await expect(
      overlapDialog.getByRole("button", { name: "Create Category" })
    ).toBeDisabled();
    await overlapDialog.getByRole("button", { name: "Cancel" }).click();

    await eligibility.editStudentLimits("Junior", 30, 35);
    await expect(eligibility.ageCategory("Junior")).toContainText("30");
    await expect(eligibility.ageCategory("Junior")).toContainText("35");

    await eligibility.ageCategory("Junior").getByTestId("row-actions").click();
    await page.getByRole("menuitem", { name: "Delete Category" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete Age Category?" })
      .getByRole("button", { name: "Delete Age Category" })
      .click();
    await expect(eligibility.ageCategory("Junior")).toHaveCount(0);
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup");
  }
});
