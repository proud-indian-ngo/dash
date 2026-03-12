import { expect, test } from "../../fixtures/test";

test.describe("Teams list (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
    await page
      .getByText("Rows per page")
      .waitFor({ state: "visible", timeout: 30_000 });
  });

  test("renders table with expected columns", async ({ page }) => {
    const header = page.getByRole("row").first();
    await expect(
      header.getByRole("columnheader", { name: /Name/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Description/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Members/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /WhatsApp Group/ })
    ).toBeVisible();
  });

  test("search box is present", async ({ page }) => {
    await expect(page.getByPlaceholder("Search teams...")).toBeVisible();
  });

  test("Create Team button is visible for admin", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await expect(
      page.getByRole("button", { name: "Create Team" })
    ).toBeVisible();
  });

  test("admin sees management description", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await expect(
      page.getByText("Manage teams and their members.")
    ).toBeVisible();
  });

  test("volunteer sees view-only description", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await expect(page.getByText("View the teams you belong to.")).toBeVisible();
  });

  test("volunteer does not see Create Team button", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await expect(
      page.getByRole("button", { name: "Create Team" })
    ).toBeHidden();
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    const columnsButton = page.getByRole("button", { name: "Columns" });
    await columnsButton.click();
    await expect(
      page.getByRole("menuitemcheckbox", { name: "Name" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("table footer is present", async ({ page }) => {
    await expect(page.getByText("Rows per page")).toBeVisible();
  });
});
