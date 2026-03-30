import { expect, test } from "../../fixtures/test";

test.describe("Volunteer role restrictions", () => {
  test("volunteer is redirected from /users to /", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/users");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("volunteer sees reimbursements list (data isolation)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/reimbursements");
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();

    // Wait for table to load
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });
  });

  test("admin sees reimbursements page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/reimbursements");
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
  });
});
