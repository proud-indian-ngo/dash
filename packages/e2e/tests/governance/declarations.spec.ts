import { expect, test } from "../../fixtures/test";

/**
 * Declarations of interests, the policy register and the annual pack
 * against the seeded board: the super admin is Asha Rao, a trustee in
 * office. The seeded vendor payment "E2E Event Vendor Payment" is pending,
 * and Vikram Menon's seeded declaration names its vendor.
 * The child-safeguarding gate itself is covered by unit tests: publishing a
 * gating version here would hold back every other spec's volunteers.
 */

const VENDOR_PAYMENT = "/vendor-payments/e2e00000-0000-0000-0000-000000000004";

test.describe("declarations and policies (super admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("the approver is warned about a declared related party", async ({
    page,
  }) => {
    // Seeded: Vikram Menon declared an interest in the vendor.
    await page.goto(VENDOR_PAYMENT);
    await expect(
      page.getByText("Vikram Menon declared an interest in E2E Event Vendor", {
        exact: false,
      })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("a trustee declares an interest and the approver is warned", async ({
    page,
  }) => {
    test.skip(
      Boolean(process.env.CI),
      "Declaring stores the declaration's PDF in R2, which CI does not have"
    );
    test.slow();
    await page.goto("/governance/declarations");
    await expect(
      page.getByRole("heading", { name: "Declarations of interests" })
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /Declare my interests|Update my declaration/,
      })
      .click();
    const dialog = page.getByRole("dialog", { name: /Declare your interests/ });
    await dialog.getByRole("button", { name: "Add an interest" }).click();
    await dialog
      .getByLabel("Person or organisation", { exact: true })
      .last()
      .fill("E2E Event Vendor");
    await dialog
      .getByLabel("Relationship", { exact: true })
      .last()
      .fill("Director");
    await dialog.getByRole("button", { exact: true, name: "Declare" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const asha = page.getByRole("row", { name: /Asha Rao/ });
    await expect(asha).toContainText("Declared");
    await expect(asha).toContainText("E2E Event Vendor");
    await expect(asha.getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      /kind=governanceDocument/
    );

    await page.goto(VENDOR_PAYMENT);
    await expect(
      page.getByText("Asha Rao declared an interest in E2E Event Vendor", {
        exact: false,
      })
    ).toBeVisible({ timeout: 20_000 });
  });

  test("publishes a policy version that trustees acknowledge from the dashboard", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E trustee code ${Date.now()}`;
    await page.goto("/governance/policies");
    await page.getByRole("button", { name: "New policy" }).click();
    const create = page.getByRole("alertdialog", { name: "New policy" });
    await create.getByLabel("Title", { exact: true }).fill(title);
    await create.getByRole("combobox", { name: "For" }).click();
    await page.getByRole("option", { name: "Trustees" }).click();
    await create.getByRole("button", { name: "Add policy" }).click();
    await expect(create).toBeHidden();

    const card = page.getByRole("region", { name: title });
    await card.getByRole("button", { name: "Publish a version" }).click();
    const publish = page.getByRole("alertdialog", {
      name: "Publish a version",
    });
    await publish.getByRole("combobox", { name: "Approved document" }).click();
    await page
      .getByRole("option", { name: /Volunteer code of conduct/ })
      .click();
    await publish
      .getByLabel("What changed", { exact: true })
      .fill("First version");
    await publish.getByRole("button", { name: "Publish" }).click();
    await expect(card.getByText("Version 1")).toBeVisible();
    await expect(card.getByText("0 acknowledged")).toBeVisible();

    await page.goto("/");
    const toRead = page.getByRole("region", { name: "Policies to read" });
    const item = toRead.getByRole("group", { name: title });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item
      .getByRole("button", { name: "I've read it and will follow it" })
      .click();
    await expect(page.getByText(title)).toBeHidden({ timeout: 20_000 });

    await page.goto("/governance/policies");
    await expect(
      page.getByRole("region", { name: title }).getByText("1 acknowledged")
    ).toBeVisible();
  });

  test("a budget item on the calendar opens its resolution template", async ({
    page,
  }) => {
    await page.goto("/governance/compliance");
    const row = page
      .locator("[data-testid^='compliance-item-']", {
        hasText: "Next year's budget approved",
      })
      .first();
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Draft the resolution" }).click();
    await expect(page).toHaveURL(/template=budget_approval/);
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Approval of the budget"
    );
    await expect(dialog.getByRole("textbox", { name: "Text" })).toHaveValue(
      /budget of the Trust for the financial year/
    );
  });
});

test.describe("declarations access", () => {
  test("a volunteer is told only trustees declare", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    await page.goto("/governance/declarations");
    await expect(
      page.getByText("Only trustees declare interests.")
    ).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "Declare your interests" })
    ).toBeHidden();
  });
});
