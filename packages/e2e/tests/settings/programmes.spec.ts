import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";

function openProgrammes(page: import("@playwright/test").Page) {
  return openSettingsPage(page, "/settings/programmes", "Programmes");
}

test.describe("Programmes settings (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("shows seeded programmes", async ({ page }) => {
    const main = await openProgrammes(page);

    await expect(main.getByText("Education")).toBeVisible({ timeout: 10_000 });
    await expect(main.getByText("Arts and culture")).toBeVisible();
    await expect(main.getByText("Community support")).toBeVisible();
  });

  test("creates and edits a programme", async ({ page }) => {
    test.slow();
    const main = await openProgrammes(page);
    const stamp = Date.now();
    const name = `E2E Programme ${stamp}`;
    const code = `E2E${String(stamp).slice(-6)}`;

    await main.getByRole("button", { name: "Add programme" }).click();
    await expect(main.getByText("New programme")).toBeVisible();
    await main.getByLabel("Name").fill(name);
    await main.getByLabel("Code").fill(code);
    await main.getByLabel("Finance approval threshold (₹)").fill("25000");
    await main.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Programme created")).toBeVisible();
    const row = main
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("₹25,000");

    await row.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(main.getByLabel("Name")).toHaveValue(name, { timeout: 5000 });
    await main.getByLabel("Name").fill(`${name} Edited`);
    await main.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Programme updated")).toBeVisible();
    await expect(main.getByText(`${name} Edited`)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("updates the default approval threshold", async ({ page }) => {
    const main = await openProgrammes(page);

    await main.getByRole("button", { name: "Edit default threshold" }).click();
    await main
      .getByLabel("Default finance approval threshold (₹)")
      .fill("12000");
    await main.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Default threshold updated")).toBeVisible();
    await expect(main.getByText("Default: ₹12,000")).toBeVisible({
      timeout: 10_000,
    });

    // Restore the seeded default so later specs see the migration value.
    await main.getByRole("button", { name: "Edit default threshold" }).click();
    await main
      .getByLabel("Default finance approval threshold (₹)")
      .fill("10000");
    await main.getByRole("button", { name: "Save" }).click();
    await expect(main.getByText("Default: ₹10,000")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("rejects a duplicate programme code", async ({ page }) => {
    const main = await openProgrammes(page);

    await main.getByRole("button", { name: "Add programme" }).click();
    await main.getByLabel("Name").fill(`E2E Dup ${Date.now()}`);
    await main.getByLabel("Code").fill("EDU");
    await main.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Code EDU is already used")).toBeVisible();
  });
});
