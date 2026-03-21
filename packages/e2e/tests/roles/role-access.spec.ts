import { expect, test } from "../../fixtures/test";

test.describe("Volunteer role restrictions", () => {
  test("volunteer is redirected from /users to /", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/users");
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("volunteer sees requests list (data isolation)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");

    await page.goto("/requests");
    await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();

    // Volunteer should see own-data description
    await expect(
      page.getByText("Submit and track your requests.")
    ).toBeVisible();

    // Wait for table to load
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });
  });

  test("admin sees management description for requests", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/requests");
    await expect(page.getByText("Review and manage all")).toBeVisible();
  });
});
