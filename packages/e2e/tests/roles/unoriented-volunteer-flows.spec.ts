import { expect, test } from "../../fixtures/test";

test.describe("Unoriented volunteer happy paths + restrictions", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "unoriented_volunteer",
      "Unoriented-volunteer only"
    );
  });

  test("unoriented_volunteer lands on dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("unoriented_volunteer can view /events", async ({ page }) => {
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("sidebar shows only Dashboard + Events nav items", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("[data-sidebar='content']");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Events" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Reimbursements" })
    ).toBeHidden();
    await expect(nav.getByRole("link", { name: "Vendors" })).toBeHidden();
    await expect(nav.getByRole("link", { name: "Teams" })).toBeHidden();
    await expect(nav.getByRole("link", { name: "Users" })).toBeHidden();
  });
});
