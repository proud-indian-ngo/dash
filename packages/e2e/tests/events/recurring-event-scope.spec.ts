import { expect, test } from "../../fixtures/test";

test.describe("Recurring event edit/cancel scope", () => {
  test.slow();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();

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

  test("edit recurring event shows scope dialog, 'This event only' opens form", async ({
    page,
  }) => {
    // Create a recurring event first
    const eventName = `E2E Scope Edit ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    // Select weekly recurrence
    await createDialog.getByText("None (one-time)").click();
    await page.getByRole("option", { name: "Weekly" }).click();

    await createDialog
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event created")).toBeVisible();
    await expect(page.getByText(eventName).first()).toBeVisible({
      timeout: 10_000,
    });

    // Click Edit on a recurring event row
    const row = page.getByRole("row").filter({ hasText: eventName }).first();
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    // Scope dialog should appear
    const scopeDialog = page.getByRole("dialog");
    await expect(scopeDialog).toBeVisible();
    await expect(scopeDialog.getByText("Edit recurring event")).toBeVisible();
    await expect(
      scopeDialog.getByRole("button", { name: "This event only" })
    ).toBeVisible();
    await expect(
      scopeDialog.getByRole("button", { name: "This and following events" })
    ).toBeVisible();
    await expect(
      scopeDialog.getByRole("button", { name: "All events in the series" })
    ).toBeVisible();

    // Select "This event only"
    await scopeDialog.getByRole("button", { name: "This event only" }).click();

    // Edit form should open
    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();

    // Recurrence builder should NOT be visible for "this" scope
    await expect(editDialog.getByText("None (one-time)")).toBeHidden();

    // Close the dialog
    await editDialog.getByRole("button", { name: "Close" }).click();
  });

  test("cancel recurring event shows scope dialog", async ({ page }) => {
    // Find a recurring event in the table
    const recurringRow = page
      .getByRole("row")
      .filter({ hasText: /every week|every month|every day/ })
      .first();

    const hasRecurring = (await recurringRow.count()) > 0;
    if (!hasRecurring) {
      test.skip(true, "No recurring events available");
      return;
    }

    // Click Cancel on the recurring event row
    await recurringRow.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "Cancel" }).click();

    // Scope dialog should appear (not the confirm dialog)
    const scopeDialog = page.getByRole("dialog");
    await expect(scopeDialog).toBeVisible();
    await expect(scopeDialog.getByText("Cancel recurring event")).toBeVisible();
    await expect(
      scopeDialog.getByRole("button", { name: "This event only" })
    ).toBeVisible();

    // Close scope dialog without selecting
    await scopeDialog.getByRole("button", { name: "Close" }).click();
  });

  test("standalone event edit skips scope dialog", async ({ page }) => {
    // Create a non-recurring event
    const eventName = `E2E No Scope ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(eventName);

    const tomorrow = new Date(Date.now() + 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    // No recurrence selected (default: None)
    await createDialog
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });

    // Click Edit — should go straight to form, no scope dialog
    const row = page.getByRole("row").filter({ hasText: eventName });
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();

    // Should NOT show scope selection
    await expect(editDialog.getByText("Edit recurring event")).toBeHidden();

    await editDialog.getByRole("button", { name: "Close" }).click();
  });
});
