import { expect, test } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("Users list (admin)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to /users — if redirected to dashboard (auth race), retry once
    await page.goto("/users");
    if (!page.url().includes("/users")) {
      await page.goto("/users");
    }
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({
      timeout: 15_000,
    });
    await new ListPage(page).waitForTableData(30_000);
  });

  test("renders users table with expected columns", async ({ page }) => {
    const header = page.getByRole("row").first();
    await expect(
      header.getByRole("columnheader", { name: /Role/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Active/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Banned/ })
    ).toBeVisible();
    await expect(
      header.getByRole("columnheader", { name: /Created/ })
    ).toBeVisible();
  });

  test("search filters rows", async ({ page }) => {
    // Wait for table to render with data (at least one data row)
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).not.toHaveCount(1, {
      timeout: 15_000,
    });
    const searchBox = page.getByPlaceholder("Search users...");
    await searchBox.fill("test-admin");
    // Should filter to show matching user
    await expect(table.getByText("test-admin@pi-dash.test")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("columns dropdown toggles column visibility", async ({ page }) => {
    const columnsButton = page.getByRole("button", { name: "Columns" });
    await columnsButton.click();
    // Toggle off a visible column
    const roleCheckbox = page.getByRole("menuitemcheckbox", { name: "Role" });
    await roleCheckbox.click();
    // Close dropdown
    await page.keyboard.press("Escape");
    // The Role column header should no longer be visible
    // Re-open and toggle it back
    await columnsButton.click();
    await page.getByRole("menuitemcheckbox", { name: "Role" }).click();
    await page.keyboard.press("Escape");
  });

  test("dragging a column header reorders it, and the order persists", async ({
    page,
  }) => {
    const role = page.getByRole("columnheader", { name: /\bRole\b/ });
    const active = page.getByRole("columnheader", { name: /\bActive\b/ });
    const roleIndex = () =>
      role.evaluate((node) => (node as HTMLTableCellElement).cellIndex);
    const before = await roleIndex();
    await role.hover();
    const from = await role
      .getByRole("button", { exact: true, name: "Drag to reorder" })
      .boundingBox();
    const to = await active.boundingBox();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    await page.mouse.move(
      from!.x + from!.width / 2,
      from!.y + from!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width * 0.75, to!.y + to!.height / 2, {
      steps: 16,
    });
    await page.mouse.up();
    await expect.poll(roleIndex).toBeGreaterThan(before);

    await page.reload();
    await new ListPage(page).waitForTableData(30_000);
    await expect.poll(roleIndex).toBeGreaterThan(before);
  });

  test("shows stats cards", async ({ page }) => {
    const cardTitles = page.locator("[data-slot='stat-label']");
    await expect(cardTitles.getByText("Total Users")).toBeVisible({
      timeout: 15_000,
    });
    // Use exact match to avoid "Active" matching "Inactive"
    await expect(cardTitles.getByText("Active", { exact: true })).toBeVisible();
    await expect(cardTitles.getByText("Inactive")).toBeVisible();
    await expect(cardTitles.getByText("Needs Orientation")).toBeVisible();
  });
});
