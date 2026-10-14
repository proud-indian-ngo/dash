import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Income access", () => {
  test("admin without donors.manage sees income but cannot record", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/income");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Income" })
    ).toBeVisible();
    await page
      .getByPlaceholder("Search donor or reference...")
      .fill("E2E Seed Donor");
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Seed Donor" })
    ).toHaveCount(1, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Record contribution" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Imports" })).toBeVisible();
  });

  test("admin without donors.manage cannot open the importer", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/income/import");
    await expect(page).not.toHaveURL(/\/income\/import/);
  });

  test("a role without donors.view or finance.view is redirected", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/income");
    await expect(page).not.toHaveURL(/\/income/);
    await expect(page.getByRole("link", { name: "Income" })).toHaveCount(0);
  });
});
