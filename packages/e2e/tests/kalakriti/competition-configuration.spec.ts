import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { KalakritiCompetitionsPage } from "../../pages/kalakriti-competitions-page";
import { KalakritiEligibilityPage } from "../../pages/kalakriti-eligibility-page";

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

test("configures a Competition and its schedule from the Competition workspace", async ({
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
    await expect(page.getByRole("tab", { name: "Schedule" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { exact: true, name: `Kalakriti ${year}` })
    ).toHaveCount(0);

    await page.goto(`/kalakriti/${year}/competitions/catalog`);
    await expect(page).toHaveURL(
      new RegExp(`/kalakriti/${year}/competitions/?$`)
    );
    await page.goto(`/kalakriti/${year}/competitions/schedule`);
    await expect(page).toHaveURL(
      new RegExp(`/kalakriti/${year}/competitions/?$`)
    );

    await competitions.gotoCategories(year);
    await competitions.category("Performing Arts").click();
    await expect(
      page.getByRole("dialog", { name: "Performing Arts" })
    ).toContainText("Competitions");
    await page.keyboard.press("Escape");

    await competitions.gotoVenues(year);
    await competitions.addVenue("Main Stage");
    await competitions.addVenue("Side Stage");
    await competitions.venue("Main Stage").click();
    await expect(
      page.getByRole("dialog", { name: "Main Stage" })
    ).toContainText("Scheduled Sessions");
    await page.keyboard.press("Escape");

    await competitions.gotoEligibility(year);
    await expect(
      page.getByRole("tab", { name: "Eligibility", selected: true })
    ).toBeVisible();
    await new KalakritiEligibilityPage(page).addAgeCategory({
      femaleStudentLimit: 20,
      maleStudentLimit: 20,
      maximumAge: 17,
      minimumAge: 13,
      name: "Senior",
      order: 1,
    });
    await expect(competitions.category("Senior")).toBeVisible();
    await competitions.gotoEditionSettings(year);
    await expect(
      page.getByRole("tab", { name: "Edition", selected: true })
    ).toBeVisible();

    await competitions.goto(year);
    await competitions.addCompetition("Solo Dance", "Junior", {
      endTime: `${year}-11-21T11:00`,
      startTime: `${year}-11-21T10:00`,
      venue: "Main Stage",
    });
    await expect(competitions.competition("Solo Dance")).toHaveCount(1);
    await expect(competitions.competition("Solo Dance")).toContainText(
      "Junior"
    );

    await competitions.competition("Solo Dance").click();
    await expect(page).toHaveURL(
      new RegExp(`/kalakriti/${year}/competitions\\?competition=[^&]+$`)
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Solo Dance" })
    ).toBeVisible();

    await competitions.goto(year);
    await page
      .getByRole("row")
      .filter({ hasText: "Solo Dance" })
      .getByTestId("row-actions")
      .click();
    await page.getByRole("menuitem", { name: "Edit Competition" }).click();
    const edit = page.getByRole("dialog", { name: "Edit Competition" });
    await expect(edit.getByLabel("Competition name")).toHaveValue("Solo Dance");
    const junior = edit.getByRole("group", { name: "Junior" });
    await expect(junior.getByLabel("Start time")).toHaveValue(
      `${year}-11-21T10:00`
    );
    await junior.getByLabel("Venue").click();
    await page.getByRole("option", { name: "Side Stage" }).click();
    await junior.getByLabel("End time").fill(`${year}-11-21T09:00`);
    await expect(
      edit.getByRole("button", { name: "Save Competition" })
    ).toBeDisabled();
    await junior.getByLabel("End time").fill(`${year}-11-21T11:30`);
    await junior.getByLabel("Start time").fill(`${year}-11-21T10:30`);
    await edit.getByLabel("Age Categories").fill("Senior");
    await page.getByRole("option", { name: "Senior" }).click();
    const senior = edit.getByRole("group", { name: "Senior" });
    await senior.getByLabel("Venue").click();
    await page.getByRole("option", { name: "Main Stage" }).click();
    await senior.getByLabel("Start time").fill(`${year}-11-21T12:00`);
    await senior.getByLabel("End time").fill(`${year}-11-21T13:00`);
    await edit.getByRole("button", { name: "Save Competition" }).click();
    await expect(edit).toBeHidden({ timeout: 30_000 });

    await expect(competitions.competition("Solo Dance")).toHaveCount(2);
    const juniorRow = competitions
      .competition("Solo Dance")
      .filter({ hasText: "Junior" });
    const seniorRow = competitions
      .competition("Solo Dance")
      .filter({ hasText: "Senior" });
    await expect(juniorRow).toContainText("Side Stage");
    await expect(seniorRow).toContainText("Main Stage");
    await juniorRow.click();
    await expect(page).toHaveURL(/competition=[^&]+$/);
    const juniorUrl = page.url();
    await competitions.goto(year);
    await competitions
      .competition("Solo Dance")
      .filter({ hasText: "Senior" })
      .click();
    await expect(page).toHaveURL(/competition=[^&]+$/);
    expect(page.url()).not.toBe(juniorUrl);

    await competitions.goto(year);
    await competitions
      .competition("Solo Dance")
      .first()
      .getByTestId("row-actions")
      .click();
    await page.getByRole("menuitem", { name: "Cancel Competition" }).click();
    const cancel = page.getByRole("alertdialog", {
      name: "Cancel Solo Dance?",
    });
    await cancel.getByRole("button", { name: "Confirm cancel" }).click();
    await expect(competitions.competition("Solo Dance")).toHaveCount(2);
    await expect(competitions.competition("Solo Dance").first()).toContainText(
      /cancelled/i
    );
    await expect(competitions.competition("Solo Dance").last()).toContainText(
      /cancelled/i
    );

    await competitions
      .competition("Solo Dance")
      .first()
      .getByTestId("row-actions")
      .click();
    await page.getByRole("menuitem", { name: "Restore Competition" }).click();
    const restore = page.getByRole("alertdialog", {
      name: "Restore Solo Dance?",
    });
    await restore.getByRole("button", { name: "Confirm restore" }).click();
    await expect(
      competitions.competition("Solo Dance").first()
    ).not.toContainText(/cancelled/i);
    await expect(
      competitions.competition("Solo Dance").last()
    ).not.toContainText(/cancelled/i);
  } finally {
    try {
      if (!page.isClosed()) {
        await page.goto("about:blank");
      }
    } finally {
      await fixture("cleanup", "admin");
    }
  }
});

test("keeps a Competition Category Lead scoped and read-only", async ({
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
    await expect(page.getByRole("tab", { name: "Edition" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Eligibility" })).toHaveCount(0);

    await competitions.gotoVenues(year);
    await expect(competitions.venue("Main Stage")).toBeVisible();
    await expect(competitions.venue("Art Hall")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Venue" })).toHaveCount(
      0
    );

    await competitions.goto(year);
    await expect(competitions.competition("Solo Dance")).toBeVisible();
    await expect(competitions.competition("Solo Painting")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add Competition" })
    ).toHaveCount(0);
    await expect(competitions.competition("Solo Dance")).toContainText(
      "Junior"
    );
    await competitions.competition("Solo Dance").click();
    await expect(page).toHaveURL(/competition=[^&]+$/);
    await expect(
      page.getByRole("button", { name: "Edit Competition" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cancel Competition" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Solo Dance" })
    ).toBeVisible();
  } finally {
    try {
      if (!page.isClosed()) {
        await page.goto("about:blank");
      }
    } finally {
      await fixture("cleanup", "volunteer");
    }
  }
});
