import { expect, test } from "../../fixtures/test";
import { createTeamViaDialog } from "../../helpers/team";

test.describe("Admin role happy paths", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
  });

  test("admin can create a team", async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    await createTeamViaDialog(page, {
      description: "Admin role smoke test",
      prefix: "E2E Admin Team",
    });
  });

  test("admin can open new vendor dialog", async ({ page }) => {
    await page.goto("/vendors");
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();

    await page.getByRole("button", { name: "Add vendor" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.getByRole("textbox", { exact: true, name: "Name" })
    ).toBeVisible();
  });
});
