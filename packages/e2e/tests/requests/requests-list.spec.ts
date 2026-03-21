import { expect, test } from "../../fixtures/test";
import { RequestPage } from "../../pages/request-page";

test.describe("Requests list", () => {
  let requests: RequestPage;

  test.beforeEach(async ({ page }) => {
    requests = new RequestPage(page, "reimbursement");
    await requests.navigateToList();
  });

  test("renders table with expected columns", async () => {
    const headers = requests.list.getColumnHeaders();
    await expect(headers.filter({ hasText: /Title/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Type/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Status/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Total/ })).toBeVisible();
    await expect(headers.filter({ hasText: /Submitted/ })).toBeVisible();
  });

  test("search box is present", async () => {
    await expect(
      requests.list.getSearchInput("Search requests...")
    ).toBeVisible();
  });

  test("New request button navigates to /requests/new", async ({ page }) => {
    await requests.list.getNewRequestButton().click();
    await page.waitForURL(/\/requests\/new/);
    await expect(
      page.getByRole("heading", { name: "New Request" })
    ).toBeVisible();
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    await requests.list.getColumnsButton().click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Title" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("table footer is present", async ({ page }) => {
    await expect(page.getByText("Rows per page")).toBeVisible();
  });

  test("shows stats cards", async () => {
    const cards = requests.list.getStatsCards();
    await expect(cards.getByText("Total")).toBeVisible({ timeout: 15_000 });
    await expect(cards.getByText("Pending")).toBeVisible();
    await expect(cards.getByText("Approved")).toBeVisible();
    await expect(cards.getByText("Rejected")).toBeVisible();
  });
});
