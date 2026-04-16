import { expect, test } from "../../fixtures/test";

test.describe("Create team dialog (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  });

  test("opens create team dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add team" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create Team" })
    ).toBeVisible();

    // Form fields
    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();
    await expect(dialog.locator("#team-whatsapp")).toBeVisible();
    await expect(dialog.locator("#create-wa-group")).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Add team" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Create button is disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Add team" }).click();
    const dialog = page.getByRole("dialog");

    // Name should be empty by default
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("");

    await expect(
      dialog.getByRole("button", { name: "Create", exact: true })
    ).toBeDisabled();
  });

  test("WhatsApp toggle hides when a group is selected", async ({ page }) => {
    await page.getByRole("button", { name: "Add team" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Toggle should be visible initially (no group selected)
    await expect(dialog.locator("#create-wa-group")).toBeVisible();

    // Open the WhatsApp group select
    await dialog.locator("#team-whatsapp").click();
    const options = page.getByRole("option");
    const optionCount = await options.count();

    // Skip if no WhatsApp groups exist besides "None"
    if (optionCount <= 1) {
      return;
    }

    // Select first real group (skip "None")
    await options.nth(1).click();

    // Toggle should now be hidden
    await expect(dialog.locator("#create-wa-group")).toBeHidden();
  });

  test("creates a new team successfully", async ({ page }) => {
    const teamName = `E2E Team ${Date.now()}`;

    await page.getByRole("button", { name: "Add team" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(teamName);
    await dialog.getByLabel("Description").fill("Test team description");

    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    // Wait for success toast first, then dialog close
    await expect(page.getByText("Team created")).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Verify team appears in the table
    await expect(page.getByText(teamName)).toBeVisible({ timeout: 10_000 });
  });
});
