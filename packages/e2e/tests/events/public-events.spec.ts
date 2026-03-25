import { expect, test } from "../../fixtures/test";

test.describe("Public events page", () => {
  test("admin can navigate to /events page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("volunteer can navigate to /events page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("events page shows table structure", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible({
      timeout: 10_000,
    });

    // Table headers should be visible
    await expect(
      page.getByRole("columnheader", { name: "Event" })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Date & Time" })
    ).toBeVisible();
  });

  test("sidebar has Events nav item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Events", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });
  });
});
