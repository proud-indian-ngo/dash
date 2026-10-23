import { expect, test } from "../../fixtures/test";

/**
 * Declarations of interests and the annual pack against the seeded board:
 * the super admin is Asha Rao, a trustee in office. The seeded vendor
 * payment "E2E Event Vendor Payment" is pending, and Vikram Menon's seeded
 * declaration, confirmed without a signature, names its vendor.
 * Publishing a policy version would hold back everyone it is for, so the
 * register is covered by policy-gate.spec.ts, which runs last, alone; the
 * child-safeguarding gate by unit tests.
 */

const VENDOR_PAYMENT = "/vendor-payments/e2e00000-0000-0000-0000-000000000004";

test.describe("declarations (super admin)", () => {
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

  test("a declaration waits for the trustee's signature before it counts", async ({
    page,
  }) => {
    test.slow();
    // Signing needs a DSC, so the declaration stays
    // waiting here: the prompt stays and the approver isn't warned.
    const party = `E2E Unsigned Party ${Date.now()}`;
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
      .fill(party);
    await dialog
      .getByLabel("Relationship", { exact: true })
      .last()
      .fill("Director");
    await dialog.getByRole("button", { exact: true, name: "Declare" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await expect(page.getByText(/is waiting for your signature/)).toBeVisible();
    // The Acrobat steps are mounted, open or under "Sign in Acrobat instead".
    await expect(
      page.locator("a[href*='kind=declarationPdf']", {
        hasText: "Download declaration",
      })
    ).toHaveCount(1);
    const asha = page.getByRole("row").filter({ hasText: "Asha Rao" }).first();
    await expect(asha).toContainText(/waiting for signature/i);
    await expect(asha).not.toContainText(party);

    await page.goto("/");
    const prompt = page.getByRole("region", { name: "Declare your interests" });
    await expect(prompt).toContainText("waiting for your signature", {
      timeout: 20_000,
    });
    await expect(prompt.getByRole("link", { name: "Sign" })).toBeVisible();
  });

  test("a budget item on the calendar opens its resolution template", async ({
    page,
  }) => {
    await page.goto("/governance/compliance");
    // Items more than 30 days out are folded by month.
    const months = page
      .getByRole("region", { name: "Later" })
      .getByRole("button", { name: /· \d+ items?$/ });
    await expect(months.first()).toBeVisible();
    for (let i = 0, n = await months.count(); i < n; i++) {
      await months.nth(i).click();
    }
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
    await expect(dialog.getByRole("textbox", { name: "Text" })).toContainText(
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
