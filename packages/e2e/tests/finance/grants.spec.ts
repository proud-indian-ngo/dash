import type { Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { books } from "../../helpers/books-steps";

/*
 * Finance → Grants: a grant over one project, its tranches and budget, a
 * contribution linked to it and the money received, spent and unspent. The
 * fixture's spending is posted into FY 2027-28 (see budgets.spec.ts), so
 * the grant runs over that year.
 */

interface GrantFixture {
  category: string;
  grantor: string;
  programme: string;
  project: string;
  reference: string;
}

async function pickOption(
  scope: Locator,
  page: Page,
  label: string,
  text: string
) {
  const combobox = scope.getByRole("combobox", { name: label });
  await combobox.click();
  await combobox.fill(text);
  const option = page.getByRole("option").filter({ hasText: text }).first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

async function selectOption(
  scope: Locator,
  page: Page,
  label: string,
  name: string | RegExp
) {
  await scope.getByLabel(label).click();
  await page.getByRole("option", { name }).click();
}

/**
 * Picks a day in a date field. Unlike `pickDate`, never presses Escape: the
 * picker closes itself, and an Escape during its exit would close the form.
 */
async function pickDay(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  await scope.getByRole("button", { exact: true, name: label }).click();
  const popup = page.getByRole("dialog").last();
  const grid = popup.getByRole("grid").first();
  await expect(grid).toBeVisible();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  const step = date < new Date() ? /previous month/i : /next month/i;
  for (let month = 0; month < 30 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: step }).click();
  }
  await day.click();
  await expect(grid).toBeHidden();
}

test.describe("Grants", () => {
  test("finance records a grant, links a gift and sees received, spent and unspent", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.slow();
    const run = `${Date.now()}`;
    const fixture = await books<GrantFixture>("grant-fixture", run);
    const title = `E2E Grant ${run}`;

    await page.goto("/finance/grants");
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "New grant" }).first().click();
    const form = page.getByRole("dialog", { name: "New grant" });
    await form.getByRole("textbox", { name: "Title" }).fill(title);
    await pickOption(form, page, "Grantor", fixture.grantor);
    await form.getByRole("textbox", { name: "Sanctioned (₹)" }).fill("5000");
    await selectOption(form, page, "Programme", fixture.programme);
    await selectOption(form, page, "Project", fixture.project);
    await pickDay(form, "Starts on", new Date(2027, 3, 1));
    await pickDay(form, "Ends on", new Date(2028, 2, 31));
    await form.getByRole("button", { name: "Add grant" }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { exact: true, name: title })
    ).toBeVisible({ timeout: 15_000 });
    const grantUrl = page.url();

    // One tranche of 3,000 expected when the grant starts.
    await page.getByRole("button", { name: "Edit tranches" }).click();
    const tranches = page.getByRole("dialog", { name: "Edit tranches" });
    await pickDay(tranches, "Tranche 1 expected on", new Date(2027, 3, 1));
    await tranches
      .getByRole("textbox", { name: "Tranche 1 amount (₹)" })
      .fill("3000");
    await tranches.getByRole("button", { name: "Save tranches" }).click();
    await expect(tranches).toBeHidden({ timeout: 10_000 });

    // A budget of 1,000 on the head the project's claim is booked to.
    await page.getByRole("button", { name: "Edit budget" }).click();
    const budget = page.getByRole("dialog", { name: "Edit budget" });
    await budget.getByLabel(`${fixture.category} (₹)`).fill("1000");
    await budget.getByRole("button", { name: "Save budget" }).click();
    await expect(budget).toBeHidden({ timeout: 10_000 });

    // Link the grantor's gift from its sheet on the Income page.
    await page.goto("/income");
    await waitForZeroReady(page);
    await page
      .getByPlaceholder("Search donor or reference...")
      .fill(fixture.reference);
    await page
      .getByRole("row")
      .filter({ hasText: fixture.grantor })
      .first()
      .click();
    const sheet = page.getByRole("dialog").filter({ hasText: fixture.grantor });
    await sheet.getByRole("button", { name: "Link to grant" }).click();
    const link = page.getByRole("dialog", { name: "Link to grant" });
    await selectOption(link, page, "Tranche", /^Tranche 1/);
    await link.getByRole("button", { name: "Link contribution" }).click();
    await expect(link).toBeHidden({ timeout: 10_000 });
    await expect(sheet.getByTestId("contribution-grant-link")).toHaveText(
      title
    );

    // Received 2,000; spent 600 on the project (the programme's own 1,000
    // is not the grant's); 1,400 unspent.
    await page.goto(grantUrl);
    await waitForZeroReady(page);
    const utilisation = page.getByTestId("grant-utilisation");
    await expect(utilisation).toContainText("Received1 contribution₹2,000.00", {
      timeout: 15_000,
    });
    await expect(utilisation).toContainText("Spent₹600.00");
    await expect(utilisation).toContainText("Closing unspent₹1,400.00");
    await expect(page.getByTestId("grant-tranches")).toContainText(
      "₹2,000.00 of ₹3,000.00"
    );
    const head = page
      .getByTestId("grant-head")
      .filter({ hasText: fixture.category });
    await expect(head).toContainText("₹1,000.00");
    await expect(head).toContainText("₹600.00");
    await expect(head).toContainText("60%");
    await expect(page.getByTestId("grant-contributions")).toContainText(
      fixture.reference
    );

    // A period after the spend: all of it is brought forward.
    await pickDay(page.locator("main"), "From", new Date(2027, 5, 1));
    await page.getByRole("button", { name: "Show period" }).click();
    await expect(utilisation).toContainText(
      "Unspent brought forward₹1,400.00",
      { timeout: 15_000 }
    );
    await expect(utilisation).toContainText("Received0 contributions₹0.00");
    await expect(utilisation).toContainText("Closing unspent₹1,400.00");

    // Unlinking takes the money off the grant.
    await page
      .getByTestId("grant-contributions")
      .getByRole("button", { name: "Row actions" })
      .click();
    await page.getByRole("menuitem", { name: "Unlink from grant" }).click();
    await expect(
      page.getByText("No contributions are linked yet", { exact: false })
    ).toBeVisible({ timeout: 15_000 });
    await expect(utilisation).toContainText("Unspent brought forward-₹600.00", {
      timeout: 15_000,
    });
  });

  test("finance.view reads grants but can't add or change them", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/finance/grants");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Grants" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New grant" })).toHaveCount(
      0
    );
  });

  test("a volunteer can't open grants", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/finance/grants");
    await expect(page).not.toHaveURL(/\/finance\/grants/);
    await expect(page.getByRole("link", { name: "Grants" })).toHaveCount(0);
  });
});
