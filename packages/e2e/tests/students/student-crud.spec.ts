import { expect, test } from "../../fixtures/test";

test.describe("Students CRUD (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  });

  test("students list page loads with seeded data", async ({ page }) => {
    // Seeded students should be visible
    await expect(
      page.getByRole("button", { name: "E2E Student 1", exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("opens create student dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: /Add student/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Create Student/i })
    ).toBeVisible();
    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
  });

  test("creates a new student successfully", async ({ page }) => {
    const studentName = `E2E Student ${Date.now()}`;
    await page.getByRole("button", { name: /Add student/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(studentName);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(studentName)).toBeVisible({ timeout: 10_000 });
  });

  test("navigates to student detail page", async ({ page }) => {
    const studentLink = page.getByRole("button", {
      name: "E2E Student 1",
      exact: true,
    });
    if ((await studentLink.count()) === 0) {
      test.skip(true, "No E2E Student 1 — seed data may be missing");
      return;
    }
    await studentLink.first().click();
    await page.waitForURL(/\/students\/[a-zA-Z0-9-]+/, { timeout: 10_000 });
    await expect(page.getByText("E2E Student 1")).toBeVisible({
      timeout: 10_000,
    });
  });
});
