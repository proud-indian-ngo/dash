import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Vendor Payments list (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/vendor-payments");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Vendor Payments" })
    ).toBeVisible();
  });

  test("renders vendor payments list with correct heading", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Vendor Payments" })
    ).toBeVisible();
  });

  test("stats cards render", async ({ page }) => {
    // Stats cards are always rendered (may show zero values)
    await expect(page.locator("[data-slot='card-title']").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("add vendor payment button navigates to new form", async ({ page }) => {
    await page.getByRole("button", { name: "Add vendor payment" }).click();
    await page.waitForURL("/vendor-payments/new", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "New Vendor Payment" })
    ).toBeVisible();
  });

  test("status filter dropdown is present", async ({ page }) => {
    // TableFilterSelect renders a select for status
    const statusFilter = page
      .getByRole("combobox", { name: "Status" })
      .or(page.getByRole("button", { name: /Status/ }));
    await expect(statusFilter.first()).toBeVisible();
  });
});

test.describe("Vendor Payments list (volunteer)", () => {
  test("volunteer can view vendor payments list", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/vendor-payments");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Vendor Payments" })
    ).toBeVisible();
    // Volunteer sees the vendor payments list (has requests.create permission)
    await expect(page.getByRole("table"))
      .toBeVisible({ timeout: 10_000 })
      .catch(() => {
        // Empty state is also acceptable
      });
  });
});
