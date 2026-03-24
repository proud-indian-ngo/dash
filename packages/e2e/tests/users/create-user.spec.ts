import { expect, test } from "../../fixtures/test";

test.describe("Create user dialog (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("opens create user dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: "Create user" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create User" })
    ).toBeVisible();

    // Form fields
    await expect(dialog.getByLabel("Name")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /^Email/ })).toBeVisible();
    await expect(dialog.getByLabel("Password")).toBeVisible();
    await expect(dialog.getByLabel("Role")).toBeVisible();
    await expect(dialog.getByLabel("Phone")).toBeVisible();
    await expect(dialog.getByLabel("Date of birth")).toBeVisible();
    await expect(dialog.getByLabel("Gender")).toBeVisible();

    // Switches (getByRole avoids strict mode violation from hidden backing checkbox)
    await expect(dialog.getByRole("switch", { name: "Active" })).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Attended orientation" })
    ).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Email verified" })
    ).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Create user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("submit button is disabled when required fields are empty", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create user" }).click();
    const dialog = page.getByRole("dialog");

    // Clear pre-filled values
    await dialog.getByLabel("Name").fill("");
    await dialog.getByRole("textbox", { name: /^Email/ }).fill("");
    await dialog.getByLabel("Password").fill("");

    // Submit button should be disabled
    await expect(
      dialog.getByRole("button", { name: "Create user" })
    ).toBeDisabled();
  });

  test("creates a new user successfully", async ({ page }) => {
    const uniqueEmail = `e2e-${Date.now()}@pi-dash.test`;

    await page.getByRole("button", { name: "Create user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill required fields
    await dialog.getByLabel("Name").fill("E2E Test User");
    await dialog.getByRole("textbox", { name: /^Email/ }).fill(uniqueEmail);
    await dialog.getByLabel("Password").fill("TestPassword123!");
    await dialog.getByLabel("Gender").click();
    await page.getByRole("option", { name: "Male", exact: true }).click();
    // Move focus away from Gender to trigger onBlur validation with the new value
    await dialog.getByLabel("Name").click();
    await expect(
      dialog.getByRole("button", { name: "Create user" })
    ).toBeEnabled({ timeout: 5000 });

    // Submit
    await dialog.getByRole("button", { name: "Create user" }).click();

    // Dialog should close and toast should appear
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("User created")).toBeVisible();

    // Verify user appears in the table
    await expect(page.getByText(uniqueEmail)).toBeVisible();
  });
});
