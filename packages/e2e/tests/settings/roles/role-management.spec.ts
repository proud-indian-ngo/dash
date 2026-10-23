import { expect, test, waitForZeroReady } from "../../../fixtures/test";
import { clickUntilDialogCloses } from "../../../helpers/dialog-submit";
import { ListPage } from "../../../pages/list-page";

async function findRoleRow(
  page: import("@playwright/test").Page,
  roleName: string
) {
  await page.getByPlaceholder("Search roles...").fill(roleName);
  const row = page.getByRole("row").filter({ hasText: roleName }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

async function expectRedirectToDashboard(
  page: import("@playwright/test").Page
) {
  async function tryRedirect(attempt: number): Promise<void> {
    await page.goto("/settings/roles");
    if (
      await page
        .getByRole("heading", { name: "Dashboard" })
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    ) {
      return;
    }

    if (attempt < 1) {
      await tryRedirect(attempt + 1);
    }
  }

  await tryRedirect(0);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Role management (super_admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin-only test");

    await page.goto("/settings/roles");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible({
      timeout: 10_000,
    });
    await new ListPage(page).waitForTableData(30_000);
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
      dialog.getByRole("heading", { name: "Create role" })
    ).toBeVisible();

    await dialog.getByLabel("ID (slug)").fill(roleId);
    await dialog.getByLabel("Name").fill(roleName);
    await clickUntilDialogCloses(dialog, "Create role");
    await expect(page.getByText("Role created!")).toBeVisible();
    await findRoleRow(page, roleName);
  });

  test("refuses a taken role ID with a 409 and a malformed one with a 400", async ({
    page,
  }, testInfo) => {
    const roleId = `e2e_dup_${Date.now()}`;

    await page.getByRole("button", { name: "Add role" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ID (slug)").fill(roleId);
    await dialog.getByLabel("Name").fill(`E2E Dup Role ${Date.now()}`);
    await clickUntilDialogCloses(dialog, "Create role");
    await expect(page.getByText("Role created!")).toBeVisible();

    // The same ID again: an expected refusal, answered with its status so
    // Error Tracking skips it, and shown to the person as written.
    await page.getByRole("button", { name: "Add role" }).click();
    await dialog.getByLabel("ID (slug)").fill(roleId);
    await dialog.getByLabel("Name").fill("E2E Dup Role again");
    const refusal = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/_serverFn/")
    );
    await dialog.getByRole("button", { name: "Create role" }).click();
    const conflict = await refusal;
    expect(conflict.status()).toBe(409);
    await expect(
      page.getByText(`Role ID "${roleId}" already exists`)
    ).toBeVisible();

    // The same call with an ID the schema refuses: Start's validator error
    // is answered as a 400 too.
    const request = conflict.request();
    const body = request.postData() ?? "";
    expect(body).toContain(roleId);
    const invalid = await page.evaluate(
      async ({ url, headers, payload }) =>
        (await fetch(url, { body: payload, headers, method: "POST" })).status,
      {
        // Start's own headers and the body's type; the browser adds the rest.
        headers: Object.fromEntries(
          Object.entries(await request.allHeaders()).filter(
            ([name]) => name === "content-type" || name.startsWith("x-")
          )
        ),
        payload: body.replace(roleId, "Not A Slug"),
        url: request.url(),
      }
    );
    expect(invalid).toBe(400);

    await testInfo.attach("refusal-statuses.json", {
      body: JSON.stringify({ conflict: conflict.status(), invalid }),
      contentType: "application/json",
    });
  });

  test("navigates to role detail page", async ({ page }) => {
    const roleId = `e2e_nav_${Date.now()}`;
    const roleName = `E2E Nav Role ${Date.now()}`;

    // Create a role first
    await page.getByRole("button", { name: "Add role" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("ID (slug)").fill(roleId);
    await createDialog.getByLabel("Name").fill(roleName);
    await clickUntilDialogCloses(createDialog, "Create role");
    await findRoleRow(page, roleName);

    // Click the role row to navigate to detail
    const roleRow = page.getByRole("row").filter({ hasText: roleName }).first();
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
    await clickUntilDialogCloses(createDialog, "Create role");
    await findRoleRow(page, roleName);

    // Navigate to detail
    const roleRow = page.getByRole("row").filter({ hasText: roleName }).first();
    await roleRow.click();
    await page.waitForURL(/\/settings\/roles\//, { timeout: 10_000 });

    await expect(page.getByRole("heading", { name: roleName })).toBeVisible({
      timeout: 10_000,
    });
    // Groups start collapsed on phones; expand the one holding the permission.
    const permissionCheckbox = page.locator("[id='perm-requests.approve']");
    if (!(await permissionCheckbox.isVisible())) {
      await page
        .getByRole("button", { name: /Reimbursements/i })
        .first()
        .click();
    }
    await expect(permissionCheckbox).toBeVisible({ timeout: 5000 });
    await page
      .getByText("Approve/Reject Reimbursements", { exact: true })
      .click();
    await expect(permissionCheckbox).toBeChecked();

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

    await expect(page.locator("[id='perm-requests.approve']")).toBeChecked();
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
    await clickUntilDialogCloses(createDialog, "Create role");
    await findRoleRow(page, roleName);

    // Delete via row action
    const list = await import("../../../pages/list-page").then(
      (m) => new m.ListPage(page)
    );
    const roleRow = page.getByRole("row").filter({ hasText: roleName }).first();
    await list.openRowActionAndClick(roleRow, "Delete");

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText(roleName)).toBeHidden({ timeout: 10_000 });
  });
});

test.describe("Roles route guard — non-super_admin redirect", () => {
  for (const role of [
    "admin",
    "finance_admin",
    "volunteer",
    "unoriented_volunteer",
  ] as const) {
    test(`${role} redirected from /settings/roles`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== role, `${role}-only test`);

      await expectRedirectToDashboard(page);
    });
  }
});
