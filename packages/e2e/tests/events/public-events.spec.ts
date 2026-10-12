import { expect, test } from "../../fixtures/test";

test.describe("Public events page", () => {
  test("admin can navigate to /events page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { exact: true, name: "Events" })
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("volunteer can navigate to /events page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { exact: true, name: "Events" })
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("events page shows the agenda toolbar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/events");
    await expect(
      page.getByRole("heading", { exact: true, name: "Events" })
    ).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole("tab", { name: /^Upcoming/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Past/ })).toBeVisible();
    await expect(page.getByPlaceholder("Search events...")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Show" })).toBeVisible();
  });

  test("sidebar has Events nav item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/");
    await expect(
      page.getByRole("link", { exact: true, name: "Events" })
    ).toBeVisible({
      timeout: 10_000,
    });
  });
});
