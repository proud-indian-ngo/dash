import { expect, test } from "../../fixtures/test";

test.describe("Admin role happy paths", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("admin can create a team", async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamName = `E2E Admin Team ${Date.now()}`;
    await page.getByRole("button", { name: "Add team" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill(teamName);
    await dialog.getByLabel("Description").fill("Admin role smoke test");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText("Team created")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 15_000 });
  });

  test("admin can open new vendor dialog", async ({ page }) => {
    await page.goto("/vendors");
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();

    await page.getByRole("button", { name: "Add vendor" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByRole("textbox", { name: "Name", exact: true })
    ).toBeVisible();
  });
});
