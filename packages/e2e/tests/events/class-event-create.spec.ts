import { expect, test } from "../../fixtures/test";

test.describe("Create class event (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    if ((await teamLink.count()) === 0) {
      test.skip(true, "No E2E team available — run team-create tests first");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows center field when type is class", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Select "Class" type
    await dialog.getByLabel("Type").click();
    await page.getByRole("option", { name: "Class" }).click();

    // Center field should appear
    await expect(dialog.getByLabel("Center")).toBeVisible();

    // Public checkbox should be hidden for class events
    await expect(dialog.getByLabel("Public")).toBeHidden();
  });

  test("hides center field when type is event", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Default type is "Event" — center field should not be visible
    await expect(dialog.getByLabel("Center")).toBeHidden();
  });

  test("creates a class event with center", async ({ page }) => {
    test.slow();
    const eventName = `E2E Class ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Select "Class" type
    await dialog.getByLabel("Type").click();
    await page.getByRole("option", { name: "Class" }).click();

    // Select a center (seeded "E2E Test Center")
    await dialog.getByLabel("Center").click();
    const centerOption = page.getByRole("option", { name: "E2E Test Center" });
    if ((await centerOption.count()) === 0) {
      test.skip(true, "No E2E Test Center — seed data may be missing");
      return;
    }
    await centerOption.click();

    await dialog.getByLabel("Name", { exact: true }).fill(eventName);

    // Set start time in the future
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const startTimeInput = dialog.getByLabel("Start Time");
    await startTimeInput.fill(
      tomorrow.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
    );

    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });
});
