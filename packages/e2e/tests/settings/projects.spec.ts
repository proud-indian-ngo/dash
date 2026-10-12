import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

test.describe("Projects settings (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("creates and edits a project under a programme", async ({ page }) => {
    test.slow();
    const main = await openSettingsPage(page, "/settings/projects", "Projects");
    const stamp = Date.now();
    const name = `E2E Project ${stamp}`;

    await main.getByRole("button", { name: "Add project" }).click();
    await expect(main.getByText("New project")).toBeVisible();
    await main.getByLabel("Name").fill(name);
    await main.getByLabel("Code").fill(`P${String(stamp).slice(-6)}`);
    await main.getByLabel("Programme").click();
    await page.getByRole("option", { name: "Education" }).click();
    await main.getByLabel("Kind").click();
    await page.getByRole("option", { name: "Class" }).click();
    await main.getByLabel("Quoted budget (₹)").fill("15000");
    await main.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Project created")).toBeVisible();
    const row = main
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("Education");
    await expect(row).toContainText("₹15,000");

    await row.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(main.getByLabel("Name")).toHaveValue(name, { timeout: 5000 });
    await main.getByLabel("Name").fill(`${name} Edited`);
    await main.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Project updated")).toBeVisible();
    await expect(main.getByText(`${name} Edited`)).toBeVisible({
      timeout: 10_000,
    });
  });
});
