import { expect, test } from "../../fixtures/test";

test.describe("Centers CRUD (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/centers");
    await expect(page.getByRole("heading", { name: "Centers" })).toBeVisible();
  });

  test("centers list page loads with seeded data", async ({ page }) => {
    // E2E seed creates "E2E Test Center"
    await expect(page.getByText("E2E Test Center")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("opens create center dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: /Add center/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Create Center/i })
    ).toBeVisible();
    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Address")).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /Add center/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Create button is disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: /Add center/i }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("");

    await expect(
      dialog.getByRole("button", { name: "Create", exact: true })
    ).toBeDisabled();
  });

  test("creates a new center successfully", async ({ page }) => {
    const centerName = `E2E Center ${Date.now()}`;

    await page.getByRole("button", { name: /Add center/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(centerName);
    await dialog.getByLabel("Address").fill("456 Test Ave");

    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    // Wait for dialog to close (mutation succeeded)
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText(centerName)).toBeVisible({ timeout: 10_000 });
  });

  test("navigates to center detail page", async ({ page }) => {
    // Click on the E2E-seeded center
    const centerLink = page.getByText("E2E Test Center");
    if ((await centerLink.count()) === 0) {
      test.skip(true, "No E2E Test Center — seed data may be missing");
      return;
    }
    await centerLink.first().click();
    await page.waitForURL(/\/centers\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "E2E Test Center" })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Centers access (volunteer)", () => {
  test("volunteer coordinator can see centers page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    // Volunteer is assigned as coordinator — they should see their center
    await page.goto("/centers");
    await expect(page.getByRole("heading", { name: "Centers" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("E2E Test Center")).toBeVisible({
      timeout: 10_000,
    });
  });
});
