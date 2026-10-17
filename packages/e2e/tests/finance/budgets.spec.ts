import type { Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { books } from "../../helpers/books-steps";

/*
 * Finance → Budgets: budget against what the books recognise as spent. The
 * fixture posts its expenses into FY 2027-28 at once, with no sweep, so
 * this spec stays out of the books serial group: the books specs freeze and
 * close FY 2026-27, never the later year.
 */

const YEAR = "2027-28";

interface BudgetFixture {
  category: string;
  programme: string;
  project: string;
}

const rowOf = (page: Page, name: string) =>
  page.getByRole("row").filter({ hasText: name }).first();

async function openBudgets(page: Page) {
  await page.goto(`/finance/budgets?year=${YEAR}`);
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { exact: true, name: "Budgets" })
  ).toBeVisible();
}

async function saveAmount(page: Page, head: string, rupees: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(`${head} (₹)`).fill(rupees);
  await dialog.getByRole("button", { name: "Save budget" }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

test.describe("Budgets", () => {
  test("a finance admin sets programme and project budgets against the books", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.slow();
    const run = `${Date.now()}`;
    const fixture = await books<BudgetFixture>("budget-fixture", run);
    await openBudgets(page);

    // A programme budget: the actual is the programme's spend, its
    // project's 600 included.
    await page.getByRole("button", { name: "Set budget" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Programme").click();
    await page.getByRole("option", { name: fixture.programme }).click();
    await saveAmount(page, fixture.category, "2000");
    // Other runs' budgets share the year; keep this run's rows in view.
    await page.getByPlaceholder("Search programmes and heads...").fill(run);
    const programmeRow = rowOf(page, fixture.programme);
    await expect(programmeRow).toContainText("₹2,000.00", { timeout: 15_000 });
    await expect(programmeRow).toContainText("₹1,600.00");
    await expect(programmeRow).toContainText("₹400.00");
    await expect(programmeRow).toContainText("80%");
    await expect(programmeRow.locator("[data-over]")).toHaveCount(0);

    // Lowered below the spend: the overrun shows in red.
    await page
      .getByRole("button", { name: `Actions for ${fixture.programme}` })
      .click();
    await page.getByRole("menuitem", { name: "Edit budget" }).click();
    await expect(dialog.getByLabel(`${fixture.category} (₹)`)).toHaveValue(
      "2000"
    );
    await saveAmount(page, fixture.category, "1500");
    await expect(programmeRow).toContainText("₹1,500.00", { timeout: 15_000 });
    await expect(programmeRow).toContainText("107%");
    await expect(programmeRow.locator("[data-over]")).toHaveClass(
      /text-destructive/
    );

    // A project budget nests under its programme: its actual is the
    // project's spend only, and the programme's figures don't change.
    await page
      .getByRole("button", { name: `Actions for ${fixture.programme}` })
      .click();
    await page.getByRole("menuitem", { name: "Set project budget" }).click();
    await expect(dialog.getByLabel("Programme")).toContainText(
      fixture.programme
    );
    await dialog.getByLabel("Project").click();
    await page.getByRole("option", { name: fixture.project }).click();
    await saveAmount(page, fixture.category, "1000");
    const projectRow = rowOf(page, fixture.project);
    await expect(projectRow).toContainText("Project", { timeout: 15_000 });
    await expect(projectRow).toContainText("₹1,000.00");
    await expect(projectRow).toContainText("₹600.00");
    await expect(projectRow).toContainText("₹400.00");
    await expect(programmeRow).toContainText("₹1,500.00");
    await expect(programmeRow).toContainText("₹1,600.00");

    // Each row expands to its heads.
    await programmeRow.getByTestId("row-expand").click();
    await expect(
      page.getByTestId("budget-line").filter({ hasText: fixture.category })
    ).toContainText("₹1,600.00");
  });

  test("finance.view reads budgets but can't set them", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto(`/finance/budgets?year=${YEAR}`);
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Budgets" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Set budget" })).toHaveCount(
      0
    );
  });

  test("a volunteer can't open budgets", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/finance/budgets");
    await expect(page).not.toHaveURL(/\/finance\/budgets/);
    await expect(page.getByRole("link", { name: "Budgets" })).toHaveCount(0);
  });
});
