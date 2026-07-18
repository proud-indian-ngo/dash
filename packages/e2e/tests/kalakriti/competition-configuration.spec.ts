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
      page.getByLabel("Performing Arts Competition Category", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByLabel("Solo Dance Competition", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByLabel("Main Stage Venue", { exact: true })
    ).toBeVisible();
    await expect(competitions.session("Solo Dance", "Junior")).toBeVisible();

    await expect(
      page.getByLabel("Visual Arts Competition Category", { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Solo Painting Competition", { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Art Hall Venue", { exact: true })
    ).toHaveCount(0);
    await expect(competitions.session("Solo Painting", "Junior")).toHaveCount(
      0
    );

    await Promise.all(
      [
        "Add Category",
        "Add Competition",
        "Add Venue",
        "Add Session",
        "Edit Solo Dance Competition",
        "Cancel Solo Dance Competition",
        "Retire Solo Dance Competition",
        "Delete Solo Dance Competition",
        "Edit Main Stage Venue",
        "Retire Main Stage Venue",
        "Delete Main Stage Venue",
        "Edit Solo Dance, Junior Session",
        "Cancel Solo Dance, Junior Session",
        "Delete Solo Dance, Junior Session",
      ].map((action) =>
        expect(
          page.getByRole("button", { exact: true, name: action })
        ).toHaveCount(0)
      )
    );
  } finally {
    await fixture("cleanup", "volunteer");
  }
});
