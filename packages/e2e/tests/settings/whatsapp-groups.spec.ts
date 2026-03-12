import { expect, test } from "../../fixtures/test";

async function openWhatsAppGroups(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByText("Settings").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "WhatsApp Groups" }).click();
  await expect(
    dialog.getByRole("link", { name: "WhatsApp Groups" })
  ).toBeVisible();
  return dialog;
}

// Only admin can access WhatsApp Groups, so volunteer project ignores this via testIgnore
test.describe("WhatsApp Groups (admin)", () => {
  test("shows empty state when no groups exist", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    // Either shows groups or "No WhatsApp groups yet."
    const addButton = dialog.getByRole("button", { name: "Add group" });
    await expect(addButton).toBeVisible();
  });

  test("can open create group form", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    await dialog.getByRole("button", { name: "Add group" }).click();
    await expect(dialog.getByText("Add Group", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Name")).toBeVisible();
    await expect(dialog.getByLabel("JID")).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();
  });

  test("create form validates required fields", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    await dialog.getByRole("button", { name: "Add group" }).click();

    // Try to submit with empty fields
    await dialog.getByRole("button", { name: "Save" }).click();

    // Validation errors should appear
    await expect(dialog.getByText("Name is required")).toBeVisible();
    await expect(dialog.getByText("JID is required")).toBeVisible();
  });

  test("can cancel create form", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    await dialog.getByRole("button", { name: "Add group" }).click();
    await expect(dialog.getByText("Add Group", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog.getByText("Add Group", { exact: true })).toBeHidden();
  });

  test("can create, edit, and delete a group", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }
    test.slow(); // create + edit + delete in one test needs extra time

    const dialog = await openWhatsAppGroups(page);
    const groupName = `E2E Test Group ${Date.now()}`;
    const groupJid = `e2e-test-${Date.now()}@g.us`;

    // Create
    await dialog.getByRole("button", { name: "Add group" }).click();
    await dialog.getByLabel("Name").fill(groupName);
    await dialog.getByLabel("JID").fill(groupJid);
    await dialog.getByLabel("Description").fill("Test description");
    await dialog.getByRole("button", { name: "Save" }).click();

    // Verify created
    await expect(dialog.getByText(groupName)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(groupJid)).toBeVisible();

    // Edit
    const groupRow = dialog
      .locator("[class*='border']")
      .filter({ hasText: groupName });
    await groupRow.getByRole("button", { name: "Edit group" }).click();
    await expect(dialog.getByText("Edit Group", { exact: true })).toBeVisible();

    const updatedName = `${groupName} Updated`;
    // Wait for the form to be populated before editing (Zero sync can detach inputs)
    const nameInput = dialog.getByLabel("Name");
    await expect(nameInput).toHaveValue(groupName, { timeout: 10_000 });
    await nameInput.fill(updatedName);
    await dialog
      .getByRole("button", { name: "Save" })
      .click({ timeout: 10_000 });

    await expect(dialog.getByText(updatedName)).toBeVisible({
      timeout: 10_000,
    });

    // Delete
    const updatedRow = dialog
      .locator("[class*='border']")
      .filter({ hasText: updatedName });
    await updatedRow.getByRole("button", { name: "Delete group" }).click();

    // Confirm deletion dialog
    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog.getByText("Delete group?")).toBeVisible();
    await alertDialog.getByRole("button", { name: "Delete" }).click();

    // Verify deleted
    await expect(dialog.getByText(updatedName)).toBeHidden({
      timeout: 10_000,
    });
  });
});
