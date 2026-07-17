import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiCentersPage } from "../../pages/kalakriti-centers-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-centers.ts"
);

async function fixture<T>(action: string, argument?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("manages independent Center registration and scoped Liaison access", async ({
  browser,
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Center workflow"
  );
  test.slow();
  const { year } = await fixture<{ year: number }>("setup", superAdminEmail);
  const centers = new KalakritiCentersPage(page);
  const volunteerState = path.resolve(
    import.meta.dirname,
    "../../.auth/volunteer.json"
  );

  try {
    await centers.goto(year);
    await waitForZeroReady(page);
    await centers.addCenter("Basavanagudi");
    await centers.addCenter("Indiranagar");
    await centers.configureRegistration("Basavanagudi", {
      participation: false,
      students: true,
    });
    await expect(centers.center("Basavanagudi")).toContainText(
      "Students: Open"
    );
    await expect(centers.center("Basavanagudi")).toContainText(
      "Participation: Closed"
    );
    await expect(centers.center("Indiranagar")).toContainText(
      "Students: Closed"
    );

    await centers.assignLiaison("Basavanagudi", "Test Volunteer");
    const volunteerContext = await browser.newContext({
      storageState: volunteerState,
    });
    const volunteerPage = await volunteerContext.newPage();
    try {
      const volunteerCenters = new KalakritiCentersPage(volunteerPage);
      await volunteerCenters.goto(year);
      await waitForZeroReady(volunteerPage);
      await expect(volunteerCenters.center("Basavanagudi")).toBeVisible();
      await expect(volunteerCenters.center("Indiranagar")).toHaveCount(0);
      await expect(
        volunteerPage.getByRole("button", { name: "Add Center" })
      ).toHaveCount(0);
    } finally {
      await volunteerContext.close();
    }

    await page.getByRole("button", { name: "Lock all registrations" }).click();
    await page
      .getByRole("alertdialog", { name: "Lock all Center registrations?" })
      .getByRole("button", { name: "Lock all registrations" })
      .click();
    await expect(centers.center("Basavanagudi")).toContainText(
      "Students: Closed"
    );
    await expect(
      page.getByRole("button", { name: "All registrations locked" })
    ).toBeDisabled();

    await centers.addCenter("Temporary Center");
    const temporary = centers.center("Temporary Center");
    await temporary.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Center" });
    await editDialog
      .getByRole("textbox", { name: "Center name" })
      .fill("Retired Center");
    await editDialog.getByRole("button", { name: "Save Center" }).click();
    const retired = centers.center("Retired Center");
    await retired.getByRole("button", { name: "Retire" }).click();
    await page
      .getByRole("alertdialog", { name: "Retire Center?" })
      .getByRole("button", { name: "Retire Center" })
      .click();
    await expect(retired).toContainText("Retired");
    await retired.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete Center?" })
      .getByRole("button", { name: "Delete Center" })
      .click();
    await expect(retired).toHaveCount(0);
  } finally {
    await fixture("cleanup");
  }
});
