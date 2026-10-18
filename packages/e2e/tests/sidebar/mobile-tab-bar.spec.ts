import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Phone tab bar", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "super_admin",
      "One role covers the shared shell"
    );
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("navigates between the main destinations", async ({ page }) => {
    await page.goto("/");
    await waitForZeroReady(page);
    const tabBar = page.getByRole("navigation", { name: "Main" });
    await expect(tabBar.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await tabBar.getByRole("link", { name: "Events" }).click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(tabBar.getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await tabBar.getByRole("link", { name: "Claims" }).click();
    await expect(page).toHaveURL(/\/reimbursements$/);

    await tabBar.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Sidebar" });
    await drawer.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(drawer).toBeHidden();
    await expect(
      tabBar.getByRole("link", { name: "Home" })
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("steps aside on form pages and on wider screens", async ({ page }) => {
    await page.goto("/reimbursements/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New reimbursement" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  });
});
