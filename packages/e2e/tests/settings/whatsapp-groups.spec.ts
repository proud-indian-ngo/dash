import { expect, test } from "../../fixtures/test";

async function openWhatsAppGroups(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const sidebar = page.locator("[data-sidebar='sidebar']");
  await sidebar.locator("[data-sidebar='menu-button']").last().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

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
  test("shows section with empty state or group list", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    // Section renders — shows either groups or empty state text
    await expect(
      dialog
        .getByText("No WhatsApp groups yet.")
        .or(dialog.getByRole("button", { name: "Edit group" }).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows add group button", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    await expect(dialog.getByRole("button", { name: "Add group" })).toBeVisible(
      { timeout: 10_000 }
    );
  });

  test("can open and cancel picker dialog", async ({ page }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }

    const dialog = await openWhatsAppGroups(page);
    const addGroupBtn = dialog.getByRole("button", { name: "Add group" });
    // Button is hidden when WhatsApp API is not configured (e.g. in CI)
    if (!(await addGroupBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(
        true,
        "WhatsApp API not configured — Add group button not shown"
      );
      return;
    }
    await expect(addGroupBtn).toBeEnabled({ timeout: 15_000 });
    await addGroupBtn.click();

    const pickerDialog = page.getByRole("dialog").filter({
      hasText: "Add WhatsApp Groups",
    });
    await expect(pickerDialog).toBeVisible();

    // Picker shows either groups (with search), an error message, or "all added" text
    await expect(
      pickerDialog
        .getByPlaceholder("Search groups...")
        .or(pickerDialog.getByText("Failed to fetch"))
        .or(
          pickerDialog.getByText("All WhatsApp groups have already been added")
        )
        .or(pickerDialog.getByText("No WhatsApp groups found"))
    ).toBeVisible({ timeout: 15_000 });

    // "Add selected" button should be disabled when nothing is selected
    const addSelectedBtn = pickerDialog.getByRole("button", {
      name: /Add selected/,
    });
    await expect(addSelectedBtn).toBeDisabled();

    // Cancel closes the dialog
    await pickerDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(pickerDialog.getByText("Add WhatsApp Groups")).toBeHidden();
  });

  test("can add group from picker, edit, and delete", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "admin") {
      test.skip();
    }
    test.slow();

    const settingsDialog = await openWhatsAppGroups(page);

    // Open picker and wait for groups to load
    const addGroupBtn = settingsDialog.getByRole("button", {
      name: "Add group",
    });
    // Button is hidden when WhatsApp API is not configured (e.g. in CI)
    if (!(await addGroupBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(
        true,
        "WhatsApp API not configured — Add group button not shown"
      );
      return;
    }
    await expect(addGroupBtn).toBeEnabled({ timeout: 15_000 });
    await addGroupBtn.click();
    const pickerDialog = page.getByRole("dialog").filter({
      hasText: "Add WhatsApp Groups",
    });
    await expect(pickerDialog).toBeVisible();

    // Wait for groups to load — if the API errors or returns no groups, skip this test
    const searchInput = pickerDialog.getByPlaceholder("Search groups...");
    try {
      await searchInput.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      // API may be rate-limited or return no available groups — skip CRUD test
      test.skip(
        true,
        "WhatsApp API unavailable or no groups to add — skipping CRUD test"
      );
      return;
    }

    // Select the first available group
    const firstGroupBtn = pickerDialog
      .locator("button")
      .filter({ has: page.locator("[role='checkbox']") })
      .first();
    await expect(firstGroupBtn).toBeVisible();
    const groupName = await firstGroupBtn
      .locator(".font-medium.text-sm")
      .textContent();
    await firstGroupBtn.click();

    // Add selected
    await pickerDialog.getByRole("button", { name: /Add selected/ }).click();

    // Verify group appears in the settings list
    await expect(settingsDialog.getByText(groupName!)).toBeVisible({
      timeout: 10_000,
    });

    // Edit
    const groupRow = settingsDialog
      .locator("[class*='border']")
      .filter({ hasText: groupName! });
    await groupRow.getByRole("button", { name: "Edit group" }).click();
    await expect(
      settingsDialog.getByText("Edit Group", { exact: true })
    ).toBeVisible();

    const updatedName = `${groupName} Updated`;
    await expect(settingsDialog.getByLabel("Name")).toHaveValue(groupName!, {
      timeout: 10_000,
    });
    await expect(async () => {
      await settingsDialog.getByLabel("Name").fill(updatedName);
    }).toPass({ timeout: 15_000 });
    await settingsDialog
      .getByRole("button", { name: "Save" })
      .click({ timeout: 10_000 });

    await expect(settingsDialog.getByText(updatedName)).toBeVisible({
      timeout: 10_000,
    });

    // Delete
    const updatedRow = settingsDialog
      .locator("[class*='border']")
      .filter({ hasText: updatedName });
    await updatedRow.getByRole("button", { name: "Delete group" }).click();

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog.getByText("Delete group?")).toBeVisible();
    await alertDialog.getByRole("button", { name: "Delete" }).click();

    await expect(settingsDialog.getByText(updatedName)).toBeHidden({
      timeout: 10_000,
    });
  });
});
