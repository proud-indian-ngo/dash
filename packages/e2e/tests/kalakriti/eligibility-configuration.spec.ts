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

test("configures Age Categories and protected Center quotas", async ({
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
      maximumAge: 10,
      minimumAge: 6,
      name: "Junior",
      order: 0,
    });
    await expect(eligibility.ageCategory("Junior")).toContainText("Ages 6-10");

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

    await eligibility.setQuota("Junior", 20, 25);
    await expect(eligibility.ageCategory("Junior")).toContainText(
      "Male 20 · Female 25"
    );

    await eligibility
      .ageCategory("Junior")
      .getByRole("button", {
        name: "Delete",
      })
      .click();
    await page
      .getByRole("alertdialog", { name: "Delete Age Category?" })
      .getByRole("button", { name: "Delete Age Category" })
      .click();
    await expect(
      page.getByText("Age Category has quotas or could not be deleted")
    ).toBeVisible();
    await expect(eligibility.ageCategory("Junior")).toBeVisible();
    await page
      .getByRole("alertdialog", { name: "Delete Age Category?" })
      .getByRole("button", { name: "Cancel" })
      .click();

    await eligibility
      .ageCategory("Junior")
      .getByRole("button", {
        name: "Remove",
      })
      .click();
    await page
      .getByRole("alertdialog", { name: "Remove Center quota?" })
      .getByRole("button", { name: "Remove Quota" })
      .click();
    await eligibility
      .ageCategory("Junior")
      .getByRole("button", {
        name: "Delete",
      })
      .click();
    await page
      .getByRole("alertdialog", { name: "Delete Age Category?" })
      .getByRole("button", { name: "Delete Age Category" })
      .click();
    await expect(eligibility.ageCategory("Junior")).toHaveCount(0);
  } finally {
    await fixture("cleanup");
  }
});
