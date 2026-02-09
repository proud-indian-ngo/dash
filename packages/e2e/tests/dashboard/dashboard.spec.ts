import { expect, test } from "../../fixtures/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows dashboard heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("shows welcome message with user name", async ({ page }) => {
    await expect(page.getByText(/Welcome\s/)).toBeVisible();
  });

  test("shows stats cards", async ({ page }) => {
    const main = page.getByRole("main");
    await expect(main.getByText("Reimbursements")).toBeVisible({
      timeout: 15_000,
    });
    await expect(main.getByText("Advance Payments")).toBeVisible();
    await expect(main.getByText("Pending Requests")).toBeVisible();
    await expect(main.getByText("Total Users")).toBeVisible();
  });
});
