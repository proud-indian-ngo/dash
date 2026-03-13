import { expect, test } from "../../fixtures/test";

test.describe("Event edit and cancel (admin)", () => {
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

  test("edits an existing event name and location", async ({ page }) => {
    test.slow();

    // First create an event to edit
    const originalName = `E2E Edit Target ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(originalName);
    await createDialog.getByLabel("Location").fill("Original Location");

    const tomorrow = new Date(Date.now() + 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(tomorrow.toISOString().slice(0, 16));

    await createDialog
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(originalName)).toBeVisible({ timeout: 10_000 });

    // Now edit it via the row action menu
    const row = page.getByRole("row").filter({ hasText: originalName });
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Event" })
    ).toBeVisible();

    // Wait for form to populate before editing
    const nameInput = editDialog.getByLabel("Name", { exact: true });
    await expect(nameInput).toHaveValue(originalName);

    const updatedName = `E2E Edited ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(updatedName);

    await editDialog.getByLabel("Location").clear();
    await editDialog.getByLabel("Location").fill("Updated Location");

    await editDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Event updated")).toBeVisible();
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test("cancels an existing future event", async ({ page }) => {
    test.slow();

    // Create a future event to cancel
    const eventName = `E2E Cancel Target ${Date.now()}`;
    await page.getByRole("button", { name: "Create Event" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel("Name", { exact: true }).fill(eventName);

    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    await createDialog
      .getByLabel("Start Time")
      .fill(nextWeek.toISOString().slice(0, 16));

    await createDialog
      .getByRole("button", { name: "Create", exact: true })
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10_000 });

    // Cancel via row action menu
    const row = page.getByRole("row").filter({ hasText: eventName });
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "Cancel" }).click();

    // Confirm dialog appears
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Cancel event")).toBeVisible();
    await expect(
      confirmDialog.getByText(`Are you sure you want to cancel "${eventName}"`)
    ).toBeVisible();

    await confirmDialog.getByRole("button", { name: "Cancel Event" }).click();

    await expect(page.getByText("Event cancelled")).toBeVisible({
      timeout: 10_000,
    });
  });
});
