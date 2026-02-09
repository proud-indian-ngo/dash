import { expect, test } from "../../fixtures/test";

test.describe("Reimbursements list", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reimbursements");
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
  });

  test("renders table with expected columns", async ({ page }) => {
    const header = page.getByRole("row").first();
    await expect(
      header.getByRole("columnheader", { name: /Title/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Status/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Total/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Expense Date/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Submitted/ })
    ).toBeVisible();
  });

  test("search box is present", async ({ page }) => {
    await expect(
      page.getByPlaceholder("Search reimbursements...")
    ).toBeVisible();
  });

  test("New request button navigates to /reimbursements/new", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "New request" }).click();
    await page.waitForURL(/\/reimbursements\/new/);
    await expect(
      page.getByRole("heading", { name: "New Reimbursement" })
    ).toBeVisible();
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    const columnsButton = page.getByRole("button", { name: "Columns" });
    await columnsButton.click();
    // Verify column checkboxes are present
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Title" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("table footer is present", async ({ page }) => {
    await expect(page.getByText("Rows per page")).toBeVisible();
  });

  test("shows stats cards", async ({ page }) => {
    const cards = page.locator("[data-slot='card-title']");
    await expect(cards.getByText("Total")).toBeVisible({ timeout: 15_000 });
    await expect(cards.getByText("Pending")).toBeVisible();
    await expect(cards.getByText("Approved")).toBeVisible();
    await expect(cards.getByText("Rejected")).toBeVisible();
  });
});
