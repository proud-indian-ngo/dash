import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiCompetitionsPage } from "../../pages/kalakriti-competitions-page";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-competitions.ts"
);

async function fixture<T>(
  action: "cleanup" | "setup",
  kind: "admin" | "volunteer",
  email?: string
): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, kind, ...(email ? [email] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("configures the Competition catalog and rejects an invalid schedule", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-admin competition workflow"
  );
  test.slow();
  const { year } = await fixture<{ year: number }>(
    "setup",
    "admin",
    superAdminEmail
  );
  const competitions = new KalakritiCompetitionsPage(page);

  try {
    await competitions.goto(year);
    await waitForZeroReady(page);
    await competitions.addCompetition("Solo Dance");
    await competitions.addCompetition("Solo Music");
    await competitions.addVenue("Main Stage");

    await page.getByRole("button", { name: "Add Session" }).click();
    await page
      .getByRole("dialog", { name: "Add Competition Session" })
      .getByRole("button", { name: "Create Session" })
      .click();
    await expect(competitions.session("Solo Dance", "Junior")).toContainText(
      "Main Stage"
    );
    await expect(page.getByText("Competition Session created")).toBeVisible();

    await page.getByRole("button", { name: "Add Session" }).click();
    const invalidScheduleDialog = page.getByRole("dialog", {
      name: "Add Competition Session",
    });
    const endTime = invalidScheduleDialog.getByLabel("End time (Asia/Kolkata)");
    await endTime.fill(`${year}-11-22T10:00`);
    await endTime.press("Tab");
    await expect(
      invalidScheduleDialog.getByRole("button", { name: "Create Session" })
    ).toBeDisabled();
  } finally {
    await fixture("cleanup", "admin");
  }
});

test("keeps a Competition Category Lead read-only", async ({
  page,
  volunteerEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "volunteer",
    "Volunteer category-lead access"
  );
  const { year } = await fixture<{ year: number }>(
    "setup",
    "volunteer",
    volunteerEmail
  );
  const competitions = new KalakritiCompetitionsPage(page);

  try {
    await competitions.goto(year);
    await waitForZeroReady(page);
    await expect(
      page.getByText("Performing Arts", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Competition" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Venue" })).toHaveCount(
      0
    );
  } finally {
    await fixture("cleanup", "volunteer");
  }
});
