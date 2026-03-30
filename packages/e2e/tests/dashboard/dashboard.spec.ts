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

  test("shows New Reimbursement button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "New Reimbursement" })
    ).toBeVisible();
  });

  test("shows stats cards", async ({ page }, testInfo) => {
    const main = page.getByRole("main");
    const isAdmin = testInfo.project.name === "admin";

    await expect(
      main.getByText(isAdmin ? "All Reimbursements" : "My Reimbursements")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      main.getByText(isAdmin ? "Pending Reviews" : "My Pending")
    ).toBeVisible();

    if (isAdmin) {
      await expect(main.getByText("Total Users")).toBeVisible();
      await expect(main.getByText("Vendor Payments")).toBeVisible();
    }
  });
});
