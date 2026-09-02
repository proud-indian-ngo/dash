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
    await expect(
      page.getByRole("heading", { exact: true, name: "Competitions" })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Overview", selected: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { exact: true, name: `Kalakriti ${year}` })
    ).toHaveCount(0);

    await page.goto(`/kalakriti/${year}`);
    await expect(
      page.getByRole("heading", { exact: true, name: `Kalakriti ${year}` })
    ).toBeVisible();

    await competitions.gotoCategories(year);
    await competitions.category("Performing Arts").click();
    await expect(
      page.getByRole("dialog", { name: "Performing Arts" })
    ).toContainText("Competitions");
    await page.keyboard.press("Escape");

    await competitions.gotoCatalog(year);
    await competitions.addCompetition("Solo Dance");
    await competitions.addCompetition("Solo Music", "Junior", {
      musicUpload: true,
    });
    await expect(competitions.competition("Solo Music")).toContainText("Music");
    await competitions.competition("Solo Dance").click();
    await expect(
      page.getByRole("dialog", { name: "Solo Dance" })
    ).toContainText("Performing Arts");
    await page.keyboard.press("Escape");

    await competitions.gotoVenues(year);
    await competitions.addVenue("Main Stage");
    await competitions.venue("Main Stage").click();
    await expect(
      page.getByRole("dialog", { name: "Main Stage" })
    ).toContainText("Scheduled Sessions");
    await page.keyboard.press("Escape");

    await competitions.gotoSchedule(year);
    await page.getByRole("button", { name: "Add Session" }).click();
    await page
      .getByRole("dialog", { name: "Add Competition Session" })
      .getByRole("button", { name: "Create Session" })
      .click();
    await expect(page.getByText("Competition Session created")).toBeVisible({
      timeout: 30_000,
    });
    await expect(competitions.session("Solo Dance", "Junior")).toContainText(
      "Main Stage",
      { timeout: 30_000 }
    );
    await competitions.session("Solo Dance", "Junior").click();
    await expect(
      page.getByRole("dialog", { name: "Solo Dance" })
    ).toContainText("Main Stage");
    await page.keyboard.press("Escape");

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
    await page.goto("about:blank");
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
    await competitions.gotoCategories(year);
    await waitForZeroReady(page);
    await expect(competitions.category("Performing Arts")).toBeVisible();
    await expect(competitions.category("Visual Arts")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add Category" })
    ).toHaveCount(0);

    await competitions.gotoCatalog(year);
    await expect(competitions.competition("Solo Dance")).toBeVisible();

    await expect(competitions.competition("Solo Painting")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add Competition" })
    ).toHaveCount(0);

    await competitions.gotoVenues(year);
    await expect(competitions.venue("Main Stage")).toBeVisible();
    await expect(competitions.venue("Art Hall")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Venue" })).toHaveCount(
      0
    );

    await competitions.gotoSchedule(year);
    await expect(competitions.session("Solo Dance", "Junior")).toBeVisible();
    await expect(competitions.session("Solo Painting", "Junior")).toHaveCount(
      0
    );
    await expect(page.getByRole("button", { name: "Add Session" })).toHaveCount(
      0
    );
  } finally {
    await page.goto("about:blank");
    await fixture("cleanup", "volunteer");
  }
});
