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

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

test("manages independent Center registration and scoped Liaison access", async ({
  baseURL,
  browser,
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Center workflow"
  );
  test.slow();
  const { guardianEmail, guardianName, guardianPassword, year } =
    await fixture<{
      guardianEmail: string;
      guardianName: string;
      guardianPassword: string;
      year: number;
    }>("setup", superAdminEmail);
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
    await centers.addCenter("Unassigned Center");
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

    await centers.assignGuardian("Basavanagudi", guardianName);
    await centers.assignGuardian("Indiranagar", guardianName);
    const guardianContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const guardianPage = await guardianContext.newPage();
    try {
      await signIn(guardianPage, guardianEmail, guardianPassword);
      const guardianCenters = new KalakritiCentersPage(guardianPage);
      await guardianCenters.goto(year);
      await waitForZeroReady(guardianPage);
      await expect(guardianCenters.center("Basavanagudi")).toBeVisible();
      await expect(guardianCenters.center("Indiranagar")).toBeVisible();
      await expect(guardianCenters.center("Unassigned Center")).toHaveCount(0);
      await expect(
        guardianPage.getByRole("button", { name: "Add Center" })
      ).toHaveCount(0);
    } finally {
      await guardianContext.close();
    }

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

    const assignedCenter = centers.center("Basavanagudi");
    await assignedCenter.getByRole("button", { name: "Retire" }).click();
    await page
      .getByRole("alertdialog", { name: "Retire Center?" })
      .getByRole("button", { name: "Retire Center" })
      .click();
    await expect(assignedCenter).toContainText("Retired");
    await assignedCenter
      .getByRole("button", {
        name: `Remove ${guardianName} as Guardians`,
      })
      .click();
    await page
      .getByRole("alertdialog", { name: "Remove Guardian assignment?" })
      .getByRole("button", { name: "Remove Guardian" })
      .click();
    await assignedCenter
      .getByRole("button", { name: "Remove Test Volunteer as Liaisons" })
      .click();
    await page
      .getByRole("alertdialog", { name: "Remove Liaison assignment?" })
      .getByRole("button", { name: "Remove Liaison" })
      .click();
    await assignedCenter.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete Center?" })
      .getByRole("button", { name: "Delete Center" })
      .click();
    await expect(assignedCenter).toHaveCount(0);

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
