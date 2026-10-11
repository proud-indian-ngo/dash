import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Not-found pages", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Layout check");
  });

  test("an unknown address keeps the sidebar and links home", async ({
    page,
  }) => {
    await page.goto("/reimbursments");
    await expect(
      page.getByRole("heading", { name: "Page not found" })
    ).toBeVisible();
    await expect(
      page.getByText("/reimbursments", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Reimbursements" }).first()
    ).toBeVisible();

    await page.getByRole("button", { name: "Go to dashboard" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a missing record names it and links back to its list", async ({
    page,
  }) => {
    await page.goto("/reimbursements/00000000-0000-7000-8000-000000000000");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Reimbursement not found" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Back to reimbursements" }).click();
    await expect(page).toHaveURL(/\/reimbursements$/);
  });
});
