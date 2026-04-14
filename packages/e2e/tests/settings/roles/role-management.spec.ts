import { expect, test } from "../../../fixtures/test";

test.describe("Role management (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/settings/roles");
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("roles list renders with system roles", async ({ page }) => {
    // Use search to surface system roles (they may be off-screen if many E2E roles accumulated)
    const searchInput = page.getByPlaceholder("Search roles...");
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await searchInput.fill("super_admin");
    await expect(
      page.getByRole("row").filter({ hasText: "super_admin" })
    ).toBeVisible({ timeout: 10_000 });

    await searchInput.clear();
    // Search for exact slug to avoid matching "Unoriented Volunteer" row too
    await searchInput.fill("volunteer");
    await expect(
      page.getByRole("row", { name: /^Volunteer volunteer/ })
    ).toBeVisible({ timeout: 10_000 });
    await searchInput.clear();

    // Add role button is visible
    await expect(page.getByRole("button", { name: "Add role" })).toBeVisible();
  });

  test("creates a custom role", async ({ page }) => {
    const roleId = `e2e_role_${Date.now()}`;
    const roleName = `E2E Test Role ${Date.now()}`;

    await page.getByRole("button", { name: "Add role" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Create Role" })
    ).toBeVisible();

    await dialog.getByLabel("ID (slug)").fill(roleId);
    await dialog.getByLabel("Name").fill(roleName);
    await dialog.getByRole("button", { name: "Create role" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Role created!")).toBeVisible();
    await expect(page.getByText(roleName)).toBeVisible({ timeout: 10_000 });
  });

  test("navigates to role detail page", async ({ page }) => {
    const roleId = `e2e_nav_${Date.now()}`;
    const roleName = `E2E Nav Role ${Date.now()}`;

    // Create a role first
    await page.getByRole("button", { name: "Add role" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("ID (slug)").fill(roleId);
    await createDialog.getByLabel("Name").fill(roleName);
    await createDialog.getByRole("button", { name: "Create role" }).click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(roleName)).toBeVisible({ timeout: 10_000 });

    // Click the role row to navigate to detail
    const roleRow = page.getByRole("row").filter({ hasText: roleName });
    await roleRow.click();
    await page.waitForURL(/\/settings\/roles\//, { timeout: 10_000 });

    await expect(page.getByRole("heading", { name: roleName })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("edits role permissions on role detail page", async ({ page }) => {
    test.slow();
    const roleId = `e2e_perm_${Date.now()}`;
    const roleName = `E2E Perm Role ${Date.now()}`;

    // Create role
    await page.getByRole("button", { name: "Add role" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("ID (slug)").fill(roleId);
    await createDialog.getByLabel("Name").fill(roleName);
    await createDialog.getByRole("button", { name: "Create role" }).click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(roleName)).toBeVisible({ timeout: 10_000 });

    // Navigate to detail
    const roleRow = page.getByRole("row").filter({ hasText: roleName });
    await roleRow.click();
    await page.waitForURL(/\/settings\/roles\//, { timeout: 10_000 });

    // Expand a permission group (click a CollapsibleTrigger)
    const firstGroup = page
      .getByRole("button", { name: /Reimbursements/i })
      .first();
    if (await firstGroup.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstGroup.click();
    }

    // Check a permission checkbox
    const firstCheckbox = page.getByRole("checkbox").first();
    await expect(firstCheckbox).toBeVisible({ timeout: 5000 });
    const wasChecked = await firstCheckbox.isChecked();
    await firstCheckbox.click();

    // Save
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Role saved!")).toBeVisible({
      timeout: 10_000,
    });

    // Verify persisted after reload
    await page.reload();
    await expect(page.getByRole("heading", { name: roleName })).toBeVisible({
      timeout: 10_000,
    });

    // Verify checkbox state was toggled
    if (await firstGroup.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstGroup.click();
    }
    if (wasChecked) {
      await expect(page.getByRole("checkbox").first()).not.toBeChecked();
    } else {
      await expect(page.getByRole("checkbox").first()).toBeChecked();
    }
  });

  test("deletes a custom role", async ({ page }) => {
    test.slow();
    const roleId = `e2e_del_${Date.now()}`;
    const roleName = `E2E Del Role ${Date.now()}`;

    // Create role
    await page.getByRole("button", { name: "Add role" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("ID (slug)").fill(roleId);
    await createDialog.getByLabel("Name").fill(roleName);
    await createDialog.getByRole("button", { name: "Create role" }).click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(roleName)).toBeVisible({ timeout: 10_000 });

    // Delete via row action
    const list = await import("../../../pages/list-page").then(
      (m) => new m.ListPage(page)
    );
    const roleRow = page.getByRole("row").filter({ hasText: roleName });
    await list.openRowActionAndClick(roleRow, "Delete");

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText(roleName)).toBeHidden({ timeout: 10_000 });
  });
});

test.describe("Roles route guard (volunteer)", () => {
  test("volunteer redirected from /settings/roles", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/settings/roles");
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
