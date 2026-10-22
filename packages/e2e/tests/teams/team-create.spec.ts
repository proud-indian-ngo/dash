import { expect, test } from "../../fixtures/test";
import { createTeamViaDialog } from "../../helpers/team";

test.describe("Create team dialog (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  });

  test("create team dialog: fields, validation, cancel and WhatsApp toggle", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add team" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create team" })
    ).toBeVisible();

    // Form fields
    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();
    await expect(dialog.locator("#team-whatsapp")).toBeVisible();
    await expect(dialog.locator("#create-wa-group")).toBeVisible();

    // Name is empty by default, so Create is disabled
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(
      dialog.getByRole("button", { exact: true, name: "Create team" })
    ).toBeDisabled();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // WhatsApp toggle hides when a group is selected
    await page.getByRole("button", { name: "Add team" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#create-wa-group")).toBeVisible();

    await dialog.locator("#team-whatsapp").click();
    const options = page.getByRole("option");
    const optionCount = await options.count();

    // Skip if no WhatsApp groups exist besides "None"
    if (optionCount <= 1) {
      return;
    }

    // Select first real group (skip "None")
    await options.nth(1).click();
    await expect(dialog.locator("#create-wa-group")).toBeHidden();
  });

  test("creates a new team successfully", async ({ page }) => {
    await createTeamViaDialog(page, {
      description: "Test team description",
      prefix: "E2E Team",
    });
  });
});
