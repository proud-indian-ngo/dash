import { expect, test } from "../../fixtures/test";

test.describe("Create event (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    // Navigate to teams page and open the first team
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

    // Click into the first team (needs at least one team from prior tests)
    const teamLink = page.getByRole("link").filter({ hasText: /E2E Team/ });
    const count = await teamLink.count();
    if (count === 0) {
      test.skip(true, "No E2E team available — run team-create tests first");
      return;
    }
    await teamLink.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("opens create event dialog with correct fields", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Create Event" })
    ).toBeVisible();

    await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();
    await expect(dialog.getByLabel("Location")).toBeVisible();
    await expect(dialog.getByLabel("Start Time")).toBeVisible();
    await expect(dialog.getByLabel("End Time")).toBeVisible();
    await expect(dialog.getByLabel("Public")).toBeVisible();
    await expect(dialog.getByText("Recurrence")).toBeVisible();
  });

  test("Create button is disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(
      dialog.getByRole("button", { name: "Create", exact: true })
    ).toBeDisabled();
  });

  test("creates a one-time event successfully", async ({ page }) => {
    const eventName = `E2E Event ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(eventName);
    await dialog.getByLabel("Location").fill("Test Location");

    // Set start time to tomorrow
    const tomorrow = new Date(Date.now() + 86_400_000);
    const datetimeLocal = tomorrow.toISOString().slice(0, 16);
    await dialog.getByLabel("Start Time").fill(datetimeLocal);

    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });
  });

  test("creates a weekly recurring event successfully", async ({ page }) => {
    const eventName = `E2E Weekly ${Date.now()}`;

    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await dialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    // Select weekly recurrence from the builder
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();

    // Recurring event should show multiple occurrences in the table
    await expect(page.getByText(eventName).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("recurrence builder shows preview of upcoming dates", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Create Event" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill("Preview Test");

    // Set start time so preview can calculate dates
    const tomorrow = new Date(Date.now() + 86_400_000);
    await dialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    // Select daily recurrence
    await dialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Daily" }).click();

    // Preview section should show upcoming dates
    await expect(dialog.getByText("Next")).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("occurrences")).toBeVisible();
  });

  test("table shows Recurrence column", async ({ page }) => {
    await expect(page.getByText("Recurrence")).toBeVisible();
  });
});
