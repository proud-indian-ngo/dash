import { expect, test } from "../../fixtures/test";
import { AdvancePaymentPage } from "../../pages/advance-payment-page";

test.describe("Advance payments list", () => {
  let ap: AdvancePaymentPage;

  test.beforeEach(async ({ page }) => {
    ap = new AdvancePaymentPage(page);
    await ap.navigateToList();
  });

  test("renders table with expected columns", async () => {
    const headers = ap.list.getColumnHeaders();
    await expect(headers.filter({ hasText: /Title/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Status/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Total/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Submitted/ })).toBeVisible();
  });

  test("search box is present", async () => {
    await expect(
      ap.list.getSearchInput("Search advance payments...")
    ).toBeVisible();
  });

  test("New request button navigates to /advance-payments/new", async ({
    page,
  }) => {
    await ap.list.getNewRequestButton().click();
    await page.waitForURL(/\/advance-payments\/new/);
    await expect(
      page.getByRole("heading", { name: "New Advance Payment" })
    ).toBeVisible();
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    await ap.list.getColumnsButton().click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Title" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("table footer is present", async ({ page }) => {
    await expect(page.getByText("Rows per page")).toBeVisible();
  });

  test("shows stats cards", async () => {
    const cards = ap.list.getStatsCards();
    await expect(cards.getByText("Total")).toBeVisible({ timeout: 15_000 });
    await expect(cards.getByText("Pending")).toBeVisible();
    await expect(cards.getByText("Approved")).toBeVisible();
    await expect(cards.getByText("Rejected")).toBeVisible();
  });
});
