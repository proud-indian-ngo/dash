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

test("manages Center transport assignments and blocks Guardians", async ({
  baseURL,
  browser,
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin Center transport workflow"
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

  try {
    await centers.goto(year);
    await waitForZeroReady(page);
    await centers.addCenter("Transport Center");
    await centers.openDetails("Transport Center");
    await waitForZeroReady(page);

    await page.getByRole("button", { name: "Add vehicle" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Add transport assignment",
    });
    await dialog.getByLabel("Vehicle").fill("Bus 1");
    await dialog.getByLabel("Driver name").fill("Ravi Kumar");
    await dialog.getByLabel("Capacity").fill("40");
    await dialog.getByRole("button", { name: "Add vehicle" }).click();
    await expect(page.getByText("Bus 1")).toBeVisible();
    await expect(page.getByText("Driver: Ravi Kumar")).toBeVisible();

    await page
      .getByRole("button", { name: "Edit", exact: true })
      .last()
      .click();
    const editDialog = page.getByRole("dialog", {
      name: "Edit transport assignment",
    });
    await editDialog.getByLabel("Vehicle").fill("Bus 2");
    await editDialog.getByLabel("Driver name").fill("Anil Kumar");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Driver: Anil Kumar")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bus 2", exact: true })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Arrived at Center", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Arrived at venue", exact: true })
    ).toBeVisible();

    await centers.goto(year);
    await centers.assignGuardian("Transport Center", guardianName);
    const guardianContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const guardianPage = await guardianContext.newPage();
    try {
      await signIn(guardianPage, guardianEmail, guardianPassword);
      await guardianPage.goto(`/kalakriti/${year}/centers`);
      await waitForZeroReady(guardianPage);
      await guardianPage
        .getByRole("row")
        .filter({
          has: guardianPage.getByText("Transport Center", { exact: true }),
        })
        .getByRole("button", { name: "Actions for Transport Center" })
        .click();
      await guardianPage
        .getByRole("menuitem", { exact: true, name: "View details" })
        .click();
      await waitForZeroReady(guardianPage);
      await expect(
        guardianPage.getByRole("button", { name: "Add vehicle" })
      ).toHaveCount(0);
    } finally {
      await guardianContext.close();
    }
  } finally {
    await fixture("cleanup");
  }
});
