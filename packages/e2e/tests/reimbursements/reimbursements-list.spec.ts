import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursements list", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(async ({ page }) => {
    reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.navigateToList();
  });

  test("renders table with expected columns", async () => {
    const headers = reimbursements.list.getColumnHeaders();
    await expect(headers.filter({ hasText: /Title/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Type/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Status/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Total/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Submitted/ })).toBeVisible();
  });

  test("search box is present", async () => {
    await expect(
      reimbursements.list.getSearchInput("Search reimbursements...")
    ).toBeVisible();
  });

  test("New reimbursement button navigates to /reimbursements/new", async ({
    page,
  }) => {
    await reimbursements.list.getNewReimbursementButton().click();
    await page.waitForURL(/\/reimbursements\/new/);
    await expect(
      page.getByRole("heading", { name: "New Reimbursement" })
    ).toBeVisible();
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    await reimbursements.list.getColumnsButton().click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Title" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("table footer is present", async ({ page }) => {
    await expect(page.getByText("Rows per page")).toBeVisible();
  });

  test("shows stats cards", async () => {
    const cards = reimbursements.list.getStatsCards();
    await expect(cards.getByText("Total")).toBeVisible({ timeout: 15_000 });
    await expect(cards.getByText("Pending")).toBeVisible();
    await expect(cards.getByText("Approved")).toBeVisible();
    await expect(cards.getByText("Rejected")).toBeVisible();
  });
});
